# Weather raster image preprocessing — dataset-independent min/max

Use when Step 3 chose **JPEG or PNG** with **`min-max-independent`** scaling (fixed physical range).

## 0. Download the script

Install dependencies first: [install_pipeline_dependency.md](install_pipeline_dependency.md).

```bash
mkdir -p pipeline
curl -fsSL -o pipeline/grib2_scalar_to_image_with_fix_min_max.py \
  "https://raw.githubusercontent.com/zwang-geog/mapbox-exif-layer/main/pipeline/grib2_scalar_to_image_with_fix_min_max.py"
```

The script reads any **GDAL-supported raster** (not limited to GRIB2), **reprojects to EPSG:4326** when needed, normalizes the scalar field to 0–255 using your fixed min/max, and writes an image. No EXIF is written.

## Command

```bash
python pipeline/grib2_scalar_to_image_with_fix_min_max.py <input_raster> <output_file> \
  [--scalar-band BAND] \
  --min-value MIN --max-value MAX
```

| Argument | Description |
|----------|-------------|
| `input_raster` | Path to input file (GRIB2, GeoTIFF, NetCDF, etc.) |
| `output_file` | Output path — extension sets format: `.jpg`, `.jpeg`, or `.png` |
| `--scalar-band` | Scalar band: **1-based index** (default: `1`) or GRIB metadata string such as `GRIB_ELEMENT=TMP` |
| `--min-value` | Fixed min for normalization (**required**) — use the display physical unit from Step 2 |
| `--max-value` | Fixed max for normalization (**required**) — use the display physical unit from Step 2 |

Use the scalar band spec from **Step 2** investigation. Set `--min-value` / `--max-value` to the physical range the user chose (e.g. `--min-value -20 --max-value 45` for temperature in °C).

## Example

```bash
python pipeline/grib2_scalar_to_image_with_fix_min_max.py input.grib2 temperature.png \
  --scalar-band 1 \
  --min-value -20 --max-value 45
```

GRIB metadata string example (select band by GRIB element key):

```bash
python pipeline/grib2_scalar_to_image_with_fix_min_max.py input.grib2 temperature.png \
  --scalar-band GRIB_ELEMENT=TMP \
  --min-value -20 --max-value 45
```

## Multi-timestep

Use a shell script to process each input file:

```bash
#!/usr/bin/env bash
set -euo pipefail

BAND=1        # scalar band index (1-based)
MIN=-20       # fixed min in display unit
MAX=45        # fixed max in display unit
i=1
for f in /path/to/grib2/files/*.grib2; do
  python pipeline/grib2_scalar_to_image_with_fix_min_max.py "$f" \
    "temperature_$(printf '%02d' $i).png" \
    --scalar-band "$BAND" \
    --min-value "$MIN" --max-value "$MAX"
  (( i++ ))
done
```

## Output

- **JPEG/PNG** with R = normalized scalar value, G = 0, B = NA mask (B = 255 for NA, B = 0 for valid).
- **`bounds_<output_stem>.txt`** beside the image — one line: **`minX,maxY,maxX,minY`** (e.g. `temperature.png` → `bounds_temperature.txt`). Required for the layer `bounds` option in Step 6.
