#!/usr/bin/env python3
"""Create a categorical PNG mask from an unmodified GEBCO elevation GeoTIFF."""

import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image


DEFAULT_THRESHOLD_METERS = -10
CLASS_VALUES = {
    "water": 255,
    "uncertain_coast": 128,
    "land": 0,
    "nodata": 64,
}


def build_mask(source_path, output_path, metadata_path, threshold_meters):
    if threshold_meters >= 0:
        raise ValueError("The water threshold must be less than 0 metres.")

    with rasterio.open(source_path) as source:
        if source.crs is None or source.crs.to_epsg() != 4326:
            raise ValueError(f"Expected EPSG:4326 input, got {source.crs}.")
        transform = source.transform
        if transform.a <= 0 or transform.e >= 0 or transform.b != 0 or transform.d != 0:
            raise ValueError("Expected an unrotated, north-up geographic raster.")

        elevation = source.read(1, masked=True)
        values = np.asarray(elevation.data)
        invalid = np.ma.getmaskarray(elevation) | ~np.isfinite(values)
        classes = np.full(values.shape, CLASS_VALUES["nodata"], dtype=np.uint8)
        classes[~invalid & (values <= threshold_meters)] = CLASS_VALUES["water"]
        classes[~invalid & (values > threshold_meters) & (values < 0)] = CLASS_VALUES["uncertain_coast"]
        classes[~invalid & (values >= 0)] = CLASS_VALUES["land"]

        bounds = source.bounds
        metadata = {
            "source": Path(source.name).name,
            "source_product": "GEBCO_2026",
            "source_doi": "10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa",
            "crs": "EPSG:4326",
            "width": source.width,
            "height": source.height,
            "bounds": [bounds.left, bounds.top, bounds.right, bounds.bottom],
            "transform": list(transform)[:6],
            "resolution_degrees": [transform.a, abs(transform.e)],
            "elevation_units": "metres",
            "source_nodata": source.nodata,
            "threshold_meters": threshold_meters,
            "class_values": CLASS_VALUES,
            "class_counts": {
                name: int(np.count_nonzero(classes == value))
                for name, value in CLASS_VALUES.items()
            },
        }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(classes, mode="L").save(output_path, optimize=True)
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="GEBCO elevation GeoTIFF (read-only)")
    parser.add_argument(
        "--threshold-meters",
        type=float,
        default=DEFAULT_THRESHOLD_METERS,
        help="deep-water cutoff; elevations above it and below zero are uncertain coast",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "public/gebco-classification.png",
    )
    parser.add_argument(
        "--metadata",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "public/gebco-classification.json",
    )
    args = parser.parse_args()
    metadata = build_mask(args.source, args.output, args.metadata, args.threshold_meters)
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
