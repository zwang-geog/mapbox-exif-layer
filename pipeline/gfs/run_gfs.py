#!/usr/bin/env python3
"""GFS JPEG overlay pipeline.

Download every forecast-hour subset GRIB into one work directory, then convert.
grib2_to_image.py writes work/<var>/<var>_<valid>.jpeg (no extra hour folders).

Then write status.json at the prefix root and, unless --skip-s3, recursive-copy
each variable folder plus status.json.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

NOAA_BASE = "https://noaa-gfs-bdp-pds.s3.amazonaws.com"
CYCLES = ("00", "06", "12", "18")
GRIDS = ("0p25", "1p00")

# Substrings to find in the NOAA .idx inventory (colon-delimited wgrib2 lines).
# Each variable maps to one or more messages we range-GET from the full GRIB.
IDX_FIELDS = {
    "wind": (":UGRD:10 m above ground:", ":VGRD:10 m above ground:"),
    "temperature": (":TMP:2 m above ground:",),
    "rh": (":RH:2 m above ground:",),
}

SCRIPT_DIR = Path(__file__).resolve().parent
PIPELINE_DIR = SCRIPT_DIR.parent
CONVERT_PY = PIPELINE_DIR / "grib2_to_image.py"
CONFIG_JSON = SCRIPT_DIR / "jpeg_gfs.json"


def load_converter():
    """Import grib2_to_image.py by path so we do not need it on PYTHONPATH."""
    spec = importlib.util.spec_from_file_location("grib2_to_image", CONVERT_PY)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {CONVERT_PY}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run_cmd(args, *, check=True, stdout=None, stderr=None):
    """Run a CLI tool (curl, aws). Raises if check=True and it fails."""
    return subprocess.run(args, check=check, stdout=stdout, stderr=stderr)


def curl_http_code(url: str) -> str:
    """Return the HTTP status code for URL (body discarded). Used to test .idx presence."""
    result = subprocess.run(
        ["curl", "-sS", "-o", os.devnull, "-w", "%{http_code}", url],
        check=False,
        capture_output=True,
        text=True,
    )
    return (result.stdout or "").strip()


def curl_download(url: str, dest: Path) -> None:
    """Download an entire URL to dest (used for the small .idx file)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    run_cmd(["curl", "-fsSL", "-o", str(dest), url])


def curl_range_append(url: str, start: int, end: int | None, dest: Path) -> None:
    """HTTP byte-range GET; append the bytes onto dest (one GRIB message).

    end=None means open-ended (`bytes=start-`), i.e. through EOF — the last
    inventory line has no next offset.
    """
    spec = f"{start}-" if end is None else f"{start}-{end}"
    with dest.open("ab") as handle:
        run_cmd(["curl", "-fsSL", "-r", spec, url], stdout=handle)


def aws_s3_cp(src: str, dest: str) -> subprocess.CompletedProcess:
    """Upload one file (`aws s3 cp src dest`)."""
    return run_cmd(["aws", "s3", "cp", src, dest], check=True)


def aws_s3_cp_recursive(src_dir: Path, dest_uri: str) -> subprocess.CompletedProcess:
    """Upload every file in src_dir to dest_uri (`aws s3 cp --recursive`)."""
    return run_cmd(["aws", "s3", "cp", str(src_dir), dest_uri, "--recursive"], check=True)


def parse_idx_range(idx_text: str, pattern: str) -> tuple[int, int | None] | None:
    """Find pattern in a NOAA .idx file and return (start_byte, end_byte).

    Each inventory line is `n:start:...`. The next line's start is this
    message's end+1. end=None means through EOF (last message in the file).
    """
    lines = [line for line in idx_text.splitlines() if line.strip()]
    starts = []
    for line in lines:
        parts = line.split(":")
        if len(parts) < 2:
            continue
        starts.append(int(parts[1]))
    for i, line in enumerate(lines):
        if pattern in line:
            start = starts[i]
            if i + 1 < len(starts):
                end = starts[i + 1] - 1
            else:
                end = None
            return start, end
    return None


def compact_to_dt(compact: str) -> datetime:
    """Parse UTC YYYYMMDDHH into a timezone-aware datetime."""
    return datetime.strptime(compact, "%Y%m%d%H").replace(tzinfo=timezone.utc)


def dt_to_compact(value: datetime) -> str:
    """Format a datetime as UTC YYYYMMDDHH (JPEG / status.json stamp)."""
    return value.strftime("%Y%m%d%H")


def unix_of(compact: str) -> int:
    """UTC YYYYMMDDHH → Unix seconds (for status.json *_unix fields)."""
    return int(compact_to_dt(compact).timestamp())


def shift_compact(compact: str, hours: int) -> str:
    """Add hours (may be negative) to a YYYYMMDDHH stamp."""
    return dt_to_compact(compact_to_dt(compact) + timedelta(hours=hours))


def default_forecast_hours(grid: str) -> list[str]:
    """Forecast-hour list for this GFS product, zero-padded to three digits.

    1p00: f000 then every 3 h to f384.
    0p25: hourly f000–f120, then every 3 h to f384.
    """
    if grid == "1p00":
        hours = [0] + list(range(3, 385, 3))
    else:
        hours = list(range(0, 121)) + list(range(123, 385, 3))
    return [f"{h:03d}" for h in hours]


def grib_urls(date: str, cycle: str, fhr: str, grid: str) -> tuple[str, str]:
    """Return (.idx URL, full GRIB URL) on NOAA Open Data for one forecast hour."""
    key = f"gfs.{date}/{cycle}/atmos/gfs.t{cycle}z.pgrb2.{grid}.f{fhr}"
    base = f"{NOAA_BASE}/{key}"
    return f"{base}.idx", base


def cycle_from_runtime(now: datetime | None = None) -> tuple[str, str]:
    """Pick (YYYYMMDD, HH) from UTC now: subtract 6 hours, floor to 00/06/12/18.

    Example: 05:36 UTC → 18z previous day; 06:00 UTC → 00z that day.
    NOAA often finishes a cycle ~5.5 h after init, so this avoids a cycle
    whose atmos/ files are still landing.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    else:
        now = now.astimezone(timezone.utc)
    lagged = now - timedelta(hours=6)
    hour = (lagged.hour // 6) * 6
    cand = lagged.replace(hour=hour, minute=0, second=0, microsecond=0)
    return cand.strftime("%Y%m%d"), cand.strftime("%H")


def wait_for_idx(url: str, tries: int, sleep_s: int) -> bool:
    """Retry GET until the .idx returns HTTP 200, or give up."""
    for attempt in range(1, tries + 1):
        if curl_http_code(url) == "200":
            return True
        if attempt < tries and sleep_s:
            print(f"    idx not ready (try {attempt}/{tries}); sleep {sleep_s}s")
            time.sleep(sleep_s)
    return False


def valid_compact_from_grib(path: Path) -> str:
    """Read GRIB_VALID_TIME (Unix UTC) from the first band; return YYYYMMDDHH."""
    from osgeo import gdal

    gdal.UseExceptions()
    ds = gdal.Open(str(path))
    if ds is None:
        raise RuntimeError(f"Could not open {path}")
    unix = None
    for i in range(1, ds.RasterCount + 1):
        raw = ds.GetRasterBand(i).GetMetadata().get("GRIB_VALID_TIME")
        if raw:
            unix = int(float(raw))
            break
    ds = None
    if unix is None:
        raise RuntimeError(f"No GRIB_VALID_TIME in {path}")
    return datetime.fromtimestamp(unix, timezone.utc).strftime("%Y%m%d%H")


def write_status(path: Path, payload: dict) -> None:
    """Write status.json (pretty-printed) at the overlay prefix root."""
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def already_complete(bucket: str, prefix: str, init: str) -> bool:
    """True if our overlay status.json is already complete for this cycle init."""
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        result = subprocess.run(
            ["aws", "s3", "cp", f"s3://{bucket}/{prefix}/status.json", str(tmp_path)],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if result.returncode != 0:
            return False
        doc = json.loads(tmp_path.read_text(encoding="utf-8"))
        return doc.get("init") == init and doc.get("status") == "complete"
    finally:
        tmp_path.unlink(missing_ok=True)


def extract_subset(idx_text: str, grib_url: str, dest: Path, variables: list[str]) -> None:
    """Build dest as concatenated GRIB messages for every requested variable.

    Any missing idx match is an error.
    """
    if dest.exists():
        dest.unlink()
    dest.touch()
    extracted = 0
    for name in variables:
        for pattern in IDX_FIELDS[name]:
            rng = parse_idx_range(idx_text, pattern)
            if rng is None:
                raise RuntimeError(f"Required idx match missing: {pattern}")
            start, end = rng
            curl_range_append(grib_url, start, end, dest)
            extracted += 1
    if extracted == 0:
        raise RuntimeError("No GRIB messages extracted")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """CLI: optional YYYYMMDD HH [f…], --grid, --vars, --skip-s3, --keep-work."""
    parser = argparse.ArgumentParser(
        description="Download GFS U/V, 2 m TMP, and 2 m RH; write EXIF JPEGs; upload to S3.",
    )
    parser.add_argument("date", nargs="?", help="Cycle date YYYYMMDD (omit with HH to auto-select)")
    parser.add_argument("cycle", nargs="?", help="Cycle hour 00, 06, 12, or 18")
    parser.add_argument("fhr", nargs="*", help="Forecast hours (default: full set for --grid)")
    parser.add_argument("--grid", choices=GRIDS, default="0p25", help="GFS lat-lon product (default: 0p25)")
    parser.add_argument(
        "--vars",
        default="wind,temperature,rh",
        help="Comma list: wind,temperature,rh (default: all three)",
    )
    parser.add_argument("--skip-s3", action="store_true")
    parser.add_argument("--keep-work", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Parse args, process each forecast hour, write status.json, optionally upload."""
    args = parse_args(argv)

    # --- 1. Which fields to extract ---
    variables = [item.strip() for item in args.vars.split(",") if item.strip()]
    unknown = [name for name in variables if name not in IDX_FIELDS]
    if unknown:
        print(f"Unknown --vars: {unknown}", file=sys.stderr)
        return 2
    if "wind" not in variables:
        print("--vars must include wind", file=sys.stderr)
        return 2

    # --- 2. Local tools and config files ---
    if shutil.which("curl") is None:
        print("Required command not found: curl", file=sys.stderr)
        return 1
    if not CONVERT_PY.is_file() or not CONFIG_JSON.is_file():
        print("Missing grib2_to_image.py or jpeg_gfs.json", file=sys.stderr)
        return 1

    # --- 3. Environment (bucket, prefix, idx retry) ---
    skip_s3 = args.skip_s3
    bucket = os.environ.get("GFS_WIND_S3_BUCKET", "")
    prefix = os.environ.get("GFS_WIND_S3_PREFIX", f"gfs/{args.grid}").strip("/")
    idx_tries = int(os.environ.get("GFS_IDX_TRIES", "3"))
    idx_sleep = int(os.environ.get("GFS_IDX_SLEEP", "60"))
    out_dir_env = os.environ.get("GFS_WIND_OUT_DIR")

    if not skip_s3:
        if shutil.which("aws") is None:
            print("Required command not found: aws", file=sys.stderr)
            return 1
        if not bucket:
            print("Set GFS_WIND_S3_BUCKET or pass --skip-s3", file=sys.stderr)
            return 2

    # --- 4. Which cycle and which f-hours ---
    if args.date is None and args.cycle is None:
        date, cycle = cycle_from_runtime()
        print(f"Auto-selected cycle {date} t{cycle}z (UTC now − 6h, floor to 00/06/12/18)")
        fhours = default_forecast_hours(args.grid) if not args.fhr else [f"{int(h.lstrip('fF')):03d}" for h in args.fhr]
    elif args.date is None or args.cycle is None:
        print("Provide both YYYYMMDD and HH, or omit both to auto-select.", file=sys.stderr)
        return 2
    else:
        date = args.date
        cycle = f"{int(args.cycle):02d}"
        if args.fhr:
            fhours = [f"{int(h.lstrip('fF')):03d}" for h in args.fhr]
        else:
            fhours = default_forecast_hours(args.grid)

    if len(date) != 8 or not date.isdigit():
        print(f"DATE must be YYYYMMDD, got: {date}", file=sys.stderr)
        return 2
    if cycle not in CYCLES:
        print(f"CYCLE must be 00, 06, 12, or 18, got: {cycle}", file=sys.stderr)
        return 2

    # --- 5. Skip if this cycle is already fully uploaded ---
    init = f"{date}{cycle}"
    if not skip_s3 and already_complete(bucket, prefix, init):
        print(f"status.json already complete for init {init}; nothing to do.")
        return 0

    converter = load_converter()
    work = Path(tempfile.mkdtemp(prefix="gfs-wind."))
    # grib2_to_image.py writes {dirname(grib)}/{var}/{var}_{valid}.jpeg, so all
    # subsets live in `work` and JPEGs accumulate in work/wind, work/temperature, …
    last_hourly = None
    last_any = None
    saw_f384 = False
    subsets: list[tuple[str, Path]] = []

    print(f"Cycle {date} t{cycle}z  grid={args.grid}  vars={','.join(variables)}  {len(fhours)} hours  work={work}")

    try:
        # --- 6. Range-GET every forecast hour into work/ (no per-hour folders) ---
        for fhr in fhours:
            print(f"==> f{fhr} download")
            idx_url, grib_url = grib_urls(date, cycle, fhr, args.grid)

            if not wait_for_idx(idx_url, idx_tries, idx_sleep):
                print(f"    skip f{fhr}: idx not available")
                continue

            idx_path = work / f"f{fhr}.idx"
            subset = work / f"f{fhr}.grib2"
            curl_download(idx_url, idx_path)
            idx_text = idx_path.read_text(encoding="utf-8", errors="replace")
            try:
                extract_subset(idx_text, grib_url, subset, variables)
            except RuntimeError as exc:
                print(f"    skip f{fhr}: {exc}")
                subset.unlink(missing_ok=True)
                continue
            subsets.append((fhr, subset))

        if not subsets:
            print("No forecast hours were processed.", file=sys.stderr)
            return 1

        # --- 7. Convert all subsets; JPEGs land in work/<var>/ ---
        full_config = json.loads(CONFIG_JSON.read_text(encoding="utf-8"))
        hour_config = work / "config.json"
        hour_config.write_text(
            json.dumps({name: full_config[name] for name in variables if name in full_config}, indent=2),
            encoding="utf-8",
        )

        for fhr, subset in subsets:
            print(f"==> f{fhr} convert")
            valid = valid_compact_from_grib(subset)
            print(f"    valid {valid}")
            last_any = valid
            if int(fhr) <= 120:
                last_hourly = valid
            if fhr == "384":
                saw_f384 = True
            converter.process_grib(str(subset), valid, str(hour_config))
            for name in variables:
                jpeg = work / name / f"{name}_{valid}.jpeg"
                if not jpeg.is_file():
                    raise RuntimeError(f"Expected JPEG not written: {jpeg}")

        # --- 8. status.json for the client time slider (prefix root, not inside a var folder) ---
        available_from = shift_compact(init, -96)
        if args.grid == "1p00":
            hourly_until = init
            cadence = "3-hourly"
        else:
            hourly_until = last_hourly or last_any
            cadence = "hourly-then-3-hourly"

        status = "complete" if saw_f384 else "partial"
        payload = {
            "status": status,
            "grid": args.grid,
            "cadence": cadence,
            "variables": variables,
            "units": {
                "wind": "m s-1",
                "temperature": "degC",
                "rh": "%",
            },
            "available_from": available_from,
            "available_from_unix": unix_of(available_from),
            "init": init,
            "init_unix": unix_of(init),
            "hourly_until": hourly_until,
            "hourly_until_unix": unix_of(hourly_until),
            "three_hourly_until": last_any,
            "three_hourly_until_unix": unix_of(last_any),
            "bounds": [-180.0, 90.0, 180.0, -90.0],
        }
        status_path = work / "status.json"
        write_status(status_path, payload)

        # --- 9. One recursive cp per variable folder, plus status.json ---
        if skip_s3:
            local_out = Path(out_dir_env) if out_dir_env else Path.cwd() / "gfs_wind_out"
            local_out.mkdir(parents=True, exist_ok=True)
            for name in variables:
                shutil.copytree(work / name, local_out / name, dirs_exist_ok=True)
            shutil.copy2(status_path, local_out / "status.json")
            print(f"Local output: {local_out}")
        else:
            for name in variables:
                aws_s3_cp_recursive(work / name, f"s3://{bucket}/{prefix}/{name}/")
            aws_s3_cp(str(status_path), f"s3://{bucket}/{prefix}/status.json")
            print(f"Uploaded to s3://{bucket}/{prefix}/")
        print(
            f"init={init} last={last_any} hourly_until={hourly_until} "
            f"status={status} grid={args.grid} available_from={available_from}"
        )
        return 0
    finally:
        if args.keep_work:
            print(f"Work directory kept: {work}")
        else:
            shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
