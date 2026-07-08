# Weather raster image preprocessing — dataset-dependent min/max (EXIF JPEG)

Use when Step 3 chose **JPEG** with **`min-max-dataset-dependent`** scaling (per-file actual min/max in EXIF).

## 0. Download the script

Install dependencies first: [install_pipeline_dependency.md](install_pipeline_dependency.md).

```bash
mkdir -p pipeline
curl -fsSL -o pipeline/grib2_to_image.py \
  "https://raw.githubusercontent.com/zwang-geog/mapbox-exif-layer/main/pipeline/grib2_to_image.py"
```

This script assumes input raster already in **EPSG:4326** — the script does **not** reproject.

## 1. Reproject to EPSG:4326 (if needed)

If Step 2 found the source CRS is not WGS 84, reproject first:

```bash
gdalwarp -t_srs EPSG:4326 -dstnodata -9999 -overwrite \
  "$GRIB_FILE" "$REPROJECTED_GRIB"
```

Skip this step when the file is already EPSG:4326.

### Useful flags

| Flag | Purpose |
|------|---------|
| `-t_srs EPSG:4326` | Reproject to WGS 84 (required before `grib2_to_image.py`) |
| `-dstnodata` *value* | Standardize the output no-data value (e.g. `-dstnodata -9999`). Not required to be `-9999`; use any sentinel your pipeline agrees on |
| `-te xmin ymin xmax ymax` | Optional crop to a geographic extent (west, south, east, north in degrees once reprojected). Omit if the full input raster should be rendered |
| `-b` | When the input has more bands than needed, subset with `-b`. GDAL band indices are **1-based**. |
| `-overwrite` | Replace the output file if it already exists; omit to fail when the output path is taken |

See [gdalwarp documentation](https://gdal.org/en/stable/programs/gdalwarp.html).

## 2. Config JSON

Create a config file in the user's project (e.g. `pipeline/weather_config.json`). Each top-level key is a named parameter; the script writes one output folder per parameter. Multiple parameters can be batched in one config and one script run.

```json
{
  "temperature": {
    "band": 1,
    "to_fahrenheit": false
  }
}
```

GRIB metadata string is supported for `band` (from **Step 2** investigation):

```json
{
  "temperature": {
    "band": "GRIB_ELEMENT=TMP",
    "to_fahrenheit": false
  }
}
```

Multiple parameters in one config:

```json
{
  "temperature": {
    "band": 1,
    "to_fahrenheit": false
  },
  "relative_humidity": {
    "band": 2
  },
  "precipitation": {
    "band": 3
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `band` | yes | Scalar band: **1-based index** (e.g. `1`) or a GRIB metadata string `KEY=VALUE` (e.g. `"GRIB_ELEMENT=TMP"`). |
| `to_fahrenheit` | no | Convert band values from °C to °F before normalization. Use when dataset is in Celsius but display unit (Step 2) is Fahrenheit. |
| `to_mph` | no | Convert band values from m/s to mph before normalization (for wind speed scalar fields). |
| `to_kph` | no | Convert band values from m/s to km/h before normalization. Do not set both `to_mph` and `to_kph`. |

## 3. Convert to EXIF JPEG

```bash
python pipeline/grib2_to_image.py <input_raster> <output_suffix> <config_json>
```

| Argument | Description |
|----------|-------------|
| `input_raster` | Reprojected file in **EPSG:4326** |
| `output_suffix` | Label in output filenames (e.g. forecast hour `01` → `temperature_01.jpeg`) |
| `config_json` | Path to the JSON config above |

Example:

```bash
python pipeline/grib2_to_image.py "$REPROJECTED_GRIB" "01" pipeline/weather_config.json
```

## Multi-timestep

Use a shell script to reproject and convert each input file:

```bash
#!/usr/bin/env bash
set -euo pipefail

i=1
for f in /path/to/grib2/files/*.grib2; do
  suffix=$(printf '%02d' $i)
  gdalwarp -t_srs EPSG:4326 -dstnodata -9999 -overwrite "$f" "reprojected_${suffix}.grib2"
  python pipeline/grib2_to_image.py "reprojected_${suffix}.grib2" "$suffix" pipeline/weather_config.json
  (( i++ ))
done
```

## Output

For each config entry, the script writes:

- `<input_dir>/<param_name>/<param_name>_<output_suffix>.jpeg` — EXIF `ImageDescription` stores the actual dataset min/max used for normalization
- `<input_dir>/bounds_<output_suffix>.txt` — one line: **`minX,maxY,maxX,minY`** — shared across all parameters from the same input file. Required for the layer `bounds` option in Step 6.
