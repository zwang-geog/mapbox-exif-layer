# Wind image preprocessing — dataset-dependent min/max (EXIF JPEG)

Use when Step 3 chose **JPEG** with **`dataset-dependent`** scaling (per-file and per-band min/max in EXIF).

## 0. Download the script

Install dependencies first: [install_pipeline_dependency.md](install_pipeline_dependency.md).

```bash
mkdir -p pipeline
curl -fsSL -o pipeline/grib2_to_image.py \
  "https://raw.githubusercontent.com/zwang-geog/mapbox-exif-layer/main/pipeline/grib2_to_image.py"
```

The input raster must already be in **EPSG:4326** — the script does **not** reproject.

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

Create a config file in the user’s project (e.g. `pipeline/wind_config.json`). Example:

```json
{
  "wind": {
    "band": [1, 2],
    "to_mph": false,
    "to_kph": false
  }
}
```

GRIB metadata strings are supported for each u/v entry (from **Step 2** investigation):

```json
{
  "wind": {
    "band": ["GRIB_ELEMENT=UGRD", "GRIB_ELEMENT=VGRD"],
    "to_mph": false,
    "to_kph": false
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `band` | yes | Two-element list for wind u/v. Each element is a **1-based band index** (e.g. `1`) or a GRIB metadata string `KEY=VALUE` (e.g. `"GRIB_ELEMENT=UGRD"`). Mixed forms are allowed (e.g. `[1, "GRIB_ELEMENT=VGRD"]`). |
| `to_mph` | no | Convert band values from m/s to mph before normalization |
| `to_kph` | no | Convert band values from m/s to km/h before normalization. Do not set both `to_mph` and `to_kph`. |

Set `to_mph` or `to_kph` when **display** velocity unit is mph or km/h but **dataset** values are in m/s.

## 3. Convert to EXIF JPEG

```bash
python pipeline/grib2_to_image.py <input_raster> <output_suffix> <config_json>
```

| Argument | Description |
|----------|-------------|
| `input_raster` | Reprojected file in **EPSG:4326** |
| `output_suffix` | Label in output filenames (e.g. forecast hour `01` → `wind_01.jpeg`) |
| `config_json` | Path to the JSON config above |

Example:

```bash
python pipeline/grib2_to_image.py "$REPROJECTED_GRIB" "01" pipeline/wind_config.json
```

## Output

For each config entry, the script writes:

- `<input_dir>/<param_name>/<param_name>_<output_suffix>.jpeg` — EXIF `ImageDescription` stores per-band min/max before normalization
- `<input_dir>/bounds_<output_suffix>.txt` — one line: **`minX,maxY,maxX,minY`**
