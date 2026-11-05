#!/usr/bin/env python3
"""Discover GOES-18 MCMIPF observations and cache a regional translucent cloud layer."""

from __future__ import annotations

import argparse
import json
import math
import ssl
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

import numpy as np
import rasterio
from affine import Affine
from PIL import Image
from pyproj import CRS, Transformer
from rasterio.enums import Resampling
from rasterio.warp import reproject, transform_bounds
from rasterio.windows import Window


BUCKET_URL = "https://noaa-goes18.s3.amazonaws.com/"
PRODUCT = "ABI-L2-MCMIPF"
REGION_BOUNDS = (-113.5, 22.0, -107.0, 29.0)  # west, south, east, north
OUTPUT_WIDTH = 960
OUTPUT_HEIGHT = 1120
MAX_OBSERVATIONS = 3
POLL_SECONDS = 180
EARTH_RADIUS_M = 6_378_137.0
S3_NAMESPACE = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
APP_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = APP_ROOT / "public" / "goes"
DEFAULT_CACHE_DIR = Path.home() / ".cache" / "tengai" / "goes18"


def parse_iso_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError(f"Expected timezone-aware UTC timestamp, got {value!r}.")
    return parsed.astimezone(timezone.utc)


def _ssl_context():
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def list_day_objects(day: datetime, timeout: int = 45) -> list[dict]:
    prefix = f"{PRODUCT}/{day.strftime('%Y/%j')}/"
    objects = []
    token = None
    while True:
        params = {"list-type": "2", "prefix": prefix, "max-keys": "1000"}
        if token:
            params["continuation-token"] = token
        query = urlencode(params)
        with urlopen(f"{BUCKET_URL}?{query}", timeout=timeout, context=_ssl_context()) as response:
            root = ET.fromstring(response.read())
        for node in root.findall("s3:Contents", S3_NAMESPACE):
            key = node.findtext("s3:Key", namespaces=S3_NAMESPACE)
            size = node.findtext("s3:Size", namespaces=S3_NAMESPACE)
            modified = node.findtext("s3:LastModified", namespaces=S3_NAMESPACE)
            if key and key.endswith(".nc") and size and modified:
                objects.append({
                    "key": key,
                    "size": int(size),
                    "last_modified": parse_iso_utc(modified),
                })
        if root.findtext("s3:IsTruncated", namespaces=S3_NAMESPACE) != "true":
            break
        token = root.findtext("s3:NextContinuationToken", namespaces=S3_NAMESPACE)
        if not token:
            raise ValueError(f"S3 listing is truncated but has no continuation token for {prefix}.")
    return sorted(objects, key=lambda item: (item["last_modified"], item["key"]), reverse=True)


def discover_candidates(now: datetime | None = None, lookback_hours: int = 36) -> list[dict]:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    candidates = []
    days_to_search = math.ceil(lookback_hours / 24) + 1
    cutoff = now - timedelta(hours=lookback_hours)
    for age in range(days_to_search):
        day = (now - timedelta(days=age)).replace(hour=0, minute=0, second=0, microsecond=0)
        try:
            candidates.extend(
                item for item in list_day_objects(day)
                if cutoff <= item["last_modified"] <= now + timedelta(minutes=2)
            )
        except Exception as error:
            print(f"GOES listing failed for {day:%Y-%j} UTC: {error}", file=sys.stderr)
    unique = {item["key"]: item for item in candidates}
    return sorted(
        unique.values(),
        key=lambda item: (item["last_modified"], item["key"]),
        reverse=True,
    )


def _product_metadata(dataset_path: str) -> tuple[dict, list[str]]:
    with rasterio.open(dataset_path, driver="HDF5") as dataset:
        return dataset.tags(), dataset.subdatasets


def _find_subdataset(subdatasets: list[str], variable: str) -> str:
    suffix = f"//{variable}"
    for subdataset in subdatasets:
        if subdataset.endswith(suffix):
            return subdataset
    raise ValueError(f"GOES granule is missing required variable {variable}.")


def _projection(tags: dict) -> tuple[CRS, float, float, float, float, float]:
    def value(key):
        full_key = f"goes_imager_projection_{key}"
        if full_key not in tags:
            raise ValueError(f"GOES product is missing projection metadata {full_key}.")
        return float(tags[full_key])

    if tags.get("goes_imager_projection_grid_mapping_name") != "geostationary":
        raise ValueError("GOES product is not on the expected geostationary fixed grid.")
    if tags.get("goes_imager_projection_sweep_angle_axis") != "x":
        raise ValueError("GOES product has an unsupported geostationary sweep axis.")
    height = value("perspective_point_height")
    longitude = value("longitude_of_projection_origin")
    semi_major = value("semi_major_axis")
    semi_minor = value("semi_minor_axis")
    projection = CRS.from_proj4(
        f"+proj=geos +h={height} +lon_0={longitude} +sweep=x "
        f"+a={semi_major} +b={semi_minor} +units=m +no_defs"
    )
    x0 = float(tags["x_add_offset"])
    dx = float(tags["x_scale_factor"])
    y0 = float(tags["y_add_offset"])
    dy = float(tags["y_scale_factor"])
    if dx <= 0 or dy >= 0:
        raise ValueError("GOES fixed-grid scan axes have unexpected orientation.")
    return projection, height, x0, dx, y0, dy


def _source_window(width, height, projection, height_m, x0, dx, y0, dy):
    west, south, east, north = REGION_BOUNDS
    edge = np.linspace(0.0, 1.0, 81, dtype=np.float64)
    longitudes = np.concatenate((
        west + (east - west) * edge,
        west + (east - west) * edge,
        np.full_like(edge, west),
        np.full_like(edge, east),
    ))
    latitudes = np.concatenate((
        np.full_like(edge, south),
        np.full_like(edge, north),
        south + (north - south) * edge,
        south + (north - south) * edge,
    ))
    transformer = Transformer.from_crs("EPSG:4326", projection, always_xy=True)
    scan_x, scan_y = transformer.transform(longitudes, latitudes)
    columns = (np.asarray(scan_x) / height_m - x0) / dx
    rows = (np.asarray(scan_y) / height_m - y0) / dy
    valid = np.isfinite(columns) & np.isfinite(rows)
    if not valid.any():
        raise ValueError("The requested Sea of Cortez region is outside the GOES-18 view.")

    col_start = max(0, math.floor(columns[valid].min()) - 3)
    col_stop = min(width, math.ceil(columns[valid].max()) + 4)
    row_start = max(0, math.floor(rows[valid].min()) - 3)
    row_stop = min(height, math.ceil(rows[valid].max()) + 4)
    if col_start >= col_stop or row_start >= row_stop:
        raise ValueError("The requested GOES-18 scan window is empty.")
    return Window(col_start, row_start, col_stop - col_start, row_stop - row_start)


def _read_calibrated(subdatasets, variable, quality_variable, window, tags):
    source_path = _find_subdataset(subdatasets, variable)
    quality_path = _find_subdataset(subdatasets, quality_variable)
    with rasterio.open(source_path) as source, rasterio.open(quality_path) as quality:
        if (source.width, source.height) != (quality.width, quality.height):
            raise ValueError(f"{variable} and {quality_variable} dimensions differ.")
        raw = source.read(1, window=window).astype(np.float32)
        dqf = quality.read(1, window=window)
        fill = source.nodatavals[0]
        scale = source.scales[0]
        offset = source.offsets[0]
        if not math.isfinite(scale) or not math.isfinite(offset):
            raise ValueError(f"{variable} has invalid calibration metadata.")
        valid = np.isfinite(raw) & (raw != fill) & (raw >= 0) & (dqf >= 0) & (dqf <= 1)
        calibrated = raw * scale + offset
        calibrated[~valid] = np.nan

    units = tags.get(f"{variable}_units")
    if not units:
        raise ValueError(f"{variable} is missing units in the GOES product metadata.")
    return calibrated, units


def _target_geometry():
    west, south, east, north = REGION_BOUNDS
    bounds = transform_bounds(
        "EPSG:4326", "EPSG:3857", west, south, east, north, densify_pts=41,
    )
    transform = rasterio.transform.from_bounds(*bounds, OUTPUT_WIDTH, OUTPUT_HEIGHT)
    corners = [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
    ]
    return bounds, transform, corners


def _reproject(data, source_transform, source_crs, destination_transform):
    destination = np.full((OUTPUT_HEIGHT, OUTPUT_WIDTH), np.nan, dtype=np.float32)
    reproject(
        source=data,
        destination=destination,
        src_transform=source_transform,
        src_crs=source_crs,
        src_nodata=np.nan,
        dst_transform=destination_transform,
        dst_crs="EPSG:3857",
        dst_nodata=np.nan,
        resampling=Resampling.bilinear,
        init_dest_nodata=True,
        num_threads=2,
    )
    return destination


def _smoothstep(edge0: float, edge1: float, values: np.ndarray) -> np.ndarray:
    weight = np.clip((values - edge0) / (edge1 - edge0), 0.0, 1.0)
    return weight * weight * (3.0 - 2.0 * weight)


def _solar_elevation(acquired: datetime, longitudes: np.ndarray, latitudes: np.ndarray):
    day = acquired.timetuple().tm_yday
    hour = acquired.hour + acquired.minute / 60 + acquired.second / 3600
    fractional_year = 2 * math.pi / 365 * (day - 1 + (hour - 12) / 24)
    equation_time = 229.18 * (
        0.000075
        + 0.001868 * math.cos(fractional_year)
        - 0.032077 * math.sin(fractional_year)
        - 0.014615 * math.cos(2 * fractional_year)
        - 0.040849 * math.sin(2 * fractional_year)
    )
    declination = (
        0.006918
        - 0.399912 * math.cos(fractional_year)
        + 0.070257 * math.sin(fractional_year)
        - 0.006758 * math.cos(2 * fractional_year)
        + 0.000907 * math.sin(2 * fractional_year)
        - 0.002697 * math.cos(3 * fractional_year)
        + 0.00148 * math.sin(3 * fractional_year)
    )
    utc_minutes = hour * 60
    true_solar_minutes = (utc_minutes + equation_time + 4 * longitudes) % 1440
    hour_angle = np.deg2rad(true_solar_minutes / 4 - 180)
    latitude = np.deg2rad(latitudes)
    cosine_zenith = (
        np.sin(latitude) * math.sin(declination)
        + np.cos(latitude) * math.cos(declination) * np.cos(hour_angle)
    )
    return np.rad2deg(np.arcsin(np.clip(cosine_zenith, -1.0, 1.0)))


def compose_cloud_texture(
    infrared_temperature: np.ndarray,
    visible_red: np.ndarray | None,
    visible_green: np.ndarray | None,
    visible_blue: np.ndarray | None,
    acquisition_time: datetime,
    destination_transform,
) -> np.ndarray:
    height, width = infrared_temperature.shape
    rows, cols = np.indices((height, width), dtype=np.float64)
    mercator_x = destination_transform.c + (cols + 0.5) * destination_transform.a
    mercator_y = destination_transform.f + (rows + 0.5) * destination_transform.e
    longitude = mercator_x / EARTH_RADIUS_M * 180 / math.pi
    latitude = np.rad2deg(2 * np.arctan(np.exp(mercator_y / EARTH_RADIUS_M)) - math.pi / 2)

    infrared_valid = np.isfinite(infrared_temperature) & (infrared_temperature > 150) & (infrared_temperature < 350)
    cloud_coldness = np.clip(294.0 - infrared_temperature, 0.0, 55.0)
    infrared_alpha = 0.42 * _smoothstep(2.0, 36.0, cloud_coldness)
    infrared_alpha[~infrared_valid] = 0.0
    infrared_luminance = np.clip(cloud_coldness / 55.0, 0.0, 1.0)
    infrared_luminance[~infrared_valid] = 0.0

    visible_available = all(
        value is not None
        for value in (visible_red, visible_green, visible_blue)
    )
    if visible_available:
        visible_valid = (
            np.isfinite(visible_red)
            & np.isfinite(visible_green)
            & np.isfinite(visible_blue)
        )
        maximum = np.maximum.reduce((visible_red, visible_green, visible_blue))
        minimum = np.minimum.reduce((visible_red, visible_green, visible_blue))
        brightness = (visible_red + visible_green + visible_blue) / 3.0
        whiteness = np.divide(
            minimum,
            maximum,
            out=np.zeros_like(maximum),
            where=maximum > 0.01,
        )
        visible_alpha = (
            0.54
            * _smoothstep(0.22, 0.55, brightness)
            * _smoothstep(0.48, 0.82, whiteness)
        )
        visible_alpha[~visible_valid] = infrared_alpha[~visible_valid]
        visible_brightness = np.where(visible_valid, brightness, infrared_luminance)
        daylight = _smoothstep(
            -5.0,
            6.0,
            _solar_elevation(acquisition_time, longitude, latitude),
        )
        alpha = (1 - daylight) * infrared_alpha + daylight * np.maximum(
            visible_alpha,
            infrared_alpha * 0.45,
        )
        luminance = (1 - daylight) * infrared_luminance + daylight * np.maximum(
            visible_brightness,
            infrared_luminance,
        )
        cloud_valid = infrared_valid | visible_valid
    else:
        alpha = infrared_alpha
        luminance = infrared_luminance
        cloud_valid = infrared_valid

    alpha[~cloud_valid] = 0.0
    tint = np.clip(luminance, 0.0, 1.0)
    image = np.empty((height, width, 4), dtype=np.uint8)
    image[..., 0] = np.rint(174 + 58 * tint).astype(np.uint8)
    image[..., 1] = np.rint(185 + 55 * tint).astype(np.uint8)
    image[..., 2] = np.rint(198 + 48 * tint).astype(np.uint8)
    image[..., 3] = np.rint(np.clip(np.nan_to_num(alpha), 0, 0.42) * 255).astype(np.uint8)
    return image


def process_granule(key: str, cache_dir: Path, public_dir: Path) -> dict:
    source_url = BUCKET_URL + key
    remote_path = "/vsicurl/" + source_url
    acquired_download_time = datetime.now(timezone.utc)

    with rasterio.Env(
        GDAL_SKIP="netCDF",
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        GDAL_HTTP_MULTIRANGE="YES",
        GDAL_HTTP_MERGE_CONSECUTIVE_RANGES="YES",
        GDAL_CACHEMAX=64,
    ):
        tags, subdatasets = _product_metadata(remote_path)
        if tags.get("platform_ID") != "G18":
            raise ValueError(f"Expected GOES-18, found platform {tags.get('platform_ID')!r}.")
        acquired_start = parse_iso_utc(tags["time_coverage_start"])
        acquired_end = parse_iso_utc(tags["time_coverage_end"])
        projection, height_m, x0, dx, y0, dy = _projection(tags)

        infrared_path = _find_subdataset(subdatasets, "CMI_C13")
        with rasterio.open(infrared_path) as dataset:
            source_width, source_height = dataset.width, dataset.height
        window = _source_window(source_width, source_height, projection, height_m, x0, dx, y0, dy)
        src_transform = Affine(
            dx * height_m,
            0,
            (x0 + window.col_off * dx - dx / 2) * height_m,
            0,
            dy * height_m,
            (y0 + window.row_off * dy - dy / 2) * height_m,
        )
        target_bounds, target_transform, coordinates = _target_geometry()
        infrared, infrared_units = _read_calibrated(
            subdatasets, "CMI_C13", "DQF_C13", window, tags,
        )
        if infrared_units != "K":
            raise ValueError(f"Expected Band 13 brightness temperature in K, got {infrared_units!r}.")

        infrared_temperature = _reproject(
            infrared, src_transform, projection, target_transform,
        )

        visible = []
        for channel in (2, 3, 1):
            name = f"CMI_C{channel:02d}"
            dqf_name = f"DQF_C{channel:02d}"
            values, units = _read_calibrated(subdatasets, name, dqf_name, window, tags)
            if units not in ("1", "dimensionless"):
                raise ValueError(f"{name} has unexpected reflectance units {units!r}.")
            visible.append(_reproject(values, src_transform, projection, target_transform))

    processed_at = datetime.now(timezone.utc)
    image = compose_cloud_texture(
        infrared_temperature,
        visible[0],
        visible[1],
        visible[2],
        acquired_start,
        target_transform,
    )
    cache_dir.mkdir(parents=True, exist_ok=True)
    public_dir.mkdir(parents=True, exist_ok=True)
    filename = f"goes18_{acquired_start.strftime('%Y%m%dT%H%M%SZ')}.png"
    local_image = cache_dir / filename
    public_image = public_dir / filename
    temporary_image = cache_dir / f".{filename}.tmp.png"
    Image.fromarray(image, mode="RGBA").save(temporary_image, optimize=True)
    temporary_image.replace(local_image)
    if public_image.resolve() != local_image.resolve():
        temporary_public = public_image.with_name(f".{public_image.name}.tmp")
        temporary_public.write_bytes(local_image.read_bytes())
        temporary_public.replace(public_image)

    manifest_path = public_dir / "manifest.json"
    prior = []
    if manifest_path.exists():
        try:
            prior = json.loads(manifest_path.read_text(encoding="utf-8")).get("observations", [])
        except (OSError, ValueError):
            prior = []
    observation = {
        "id": key.rsplit("/", 1)[-1],
        "satellite": "GOES-18",
        "product": PRODUCT,
        "acquisitionStart": acquired_start.isoformat().replace("+00:00", "Z"),
        "acquisitionEnd": acquired_end.isoformat().replace("+00:00", "Z"),
        "downloadedAt": acquired_download_time.isoformat().replace("+00:00", "Z"),
        "processedAt": processed_at.isoformat().replace("+00:00", "Z"),
        "image": f"/goes/{filename}",
        "coordinates": coordinates,
        "width": OUTPUT_WIDTH,
        "height": OUTPUT_HEIGHT,
        "projection": "EPSG:3857",
        "sourceProjection": {
            "gridMapping": "geostationary",
            "longitudeOfProjectionOrigin": float(tags["goes_imager_projection_longitude_of_projection_origin"]),
            "perspectivePointHeightMeters": float(tags["goes_imager_projection_perspective_point_height"]),
            "sweepAngleAxis": tags["goes_imager_projection_sweep_angle_axis"],
            "xScanSpacingRadians": float(tags["x_scale_factor"]),
            "yScanSpacingRadians": float(tags["y_scale_factor"]),
        },
        "processing": {
            "infrared": "ABI Band 13 calibrated brightness temperature (K); cold-cloud alpha",
            "daytime": "ABI Bands 2/3/1 calibrated reflectance with per-band DQF and solar elevation",
            "quality": "DQF values 0 and 1 retained; invalid/fill pixels transparent",
            "transition": "Observation image only; no synthetic cloud motion",
        },
    }
    observations = [observation] + [
        previous for previous in prior
        if previous.get("id") != observation["id"]
    ]
    observations = observations[:MAX_OBSERVATIONS]
    keep_names = {Path(item["image"]).name for item in observations}
    for item in public_dir.glob("goes18_*.png"):
        if item.name not in keep_names:
            item.unlink(missing_ok=True)
    for item in cache_dir.glob("goes18_*.png"):
        if item.name not in keep_names:
            item.unlink(missing_ok=True)

    manifest = {
        "satellite": "GOES-18",
        "product": PRODUCT,
        "updatedAt": processed_at.isoformat().replace("+00:00", "Z"),
        "lastSuccessfulUpdate": processed_at.isoformat().replace("+00:00", "Z"),
        "region": {
            "bounds": list(REGION_BOUNDS),
            "targetProjection": "EPSG:3857",
            "targetBounds": list(target_bounds),
        },
        "observations": observations,
    }
    manifest_tmp = manifest_path.with_suffix(".json.tmp")
    manifest_tmp.write_text(json.dumps(manifest, separators=(",", ":")) + "\n", encoding="utf-8")
    manifest_tmp.replace(manifest_path)
    return observation


def update_once(cache_dir: Path, public_dir: Path, now: datetime | None = None) -> dict | None:
    manifest_path = public_dir / "manifest.json"
    current_id = None
    if manifest_path.exists():
        try:
            current_id = json.loads(manifest_path.read_text(encoding="utf-8"))["observations"][0]["id"]
        except (OSError, ValueError, KeyError, IndexError):
            current_id = None

    for candidate in discover_candidates(now):
        if candidate["key"].rsplit("/", 1)[-1] == current_id:
            print(f"GOES-18 cache is current: {current_id}")
            return None
        try:
            observation = process_granule(candidate["key"], cache_dir, public_dir)
            print(
                "Processed GOES-18 observation "
                f"{observation['acquisitionStart']} to {observation['acquisitionEnd']} "
                f"from {candidate['key']}"
            )
            return observation
        except Exception as error:
            print(f"GOES granule unusable; trying previous observation: {candidate['key']}: {error}", file=sys.stderr)
    raise RuntimeError("No complete, usable GOES-18 MCMIPF observation could be processed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true", help="process the newest available observation and exit")
    parser.add_argument("--watch", action="store_true", help=f"poll NOAA every {POLL_SECONDS} seconds")
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR)
    parser.add_argument("--public-dir", type=Path, default=PUBLIC_DIR)
    parser.add_argument("--poll-seconds", type=int, default=POLL_SECONDS)
    args = parser.parse_args()

    if args.once or not args.watch:
        update_once(args.cache_dir, args.public_dir)
        return
    if args.poll_seconds < 30:
        parser.error("--poll-seconds must be at least 30.")

    while True:
        started = time.monotonic()
        try:
            update_once(args.cache_dir, args.public_dir)
        except Exception as error:
            print(f"GOES update failed; retaining last successful image: {error}", file=sys.stderr)
        elapsed = time.monotonic() - started
        time.sleep(max(1, args.poll_seconds - elapsed))


if __name__ == "__main__":
    main()
