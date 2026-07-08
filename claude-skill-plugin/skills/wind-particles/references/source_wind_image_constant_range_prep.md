# Wind image preprocessing — dataset-independent min/max

Use when Step 3 chose **JPEG or PNG** with **`dataset-independent`** scaling (fixed physical range).

## 0. Download the script

Install dependencies first: [install_pipeline_dependency.md](install_pipeline_dependency.md).

```bash
mkdir -p pipeline
curl -fsSL -o pipeline/grib2_uv_to_image_with_fix_min_max.py \
  "https://raw.githubusercontent.com/zwang-geog/mapbox-exif-layer/main/pipeline/grib2_uv_to_image_with_fix_min_max.py"
```

The script reads any **GDAL-supported raster** (not limited to GRIB2), **reprojects to EPSG:4326** when needed, normalizes u/v to 0–255 using your fixed min/max, and writes an image.

## Command

```bash
python pipeline/grib2_uv_to_image_with_fix_min_max.py <input_raster> <output_file> \
  [--u-band UBAND] [--v-band VBAND] \
  [--min-value MIN] [--max-value MAX]
```

| Argument | Description |
|----------|-------------|
| `input_raster` | Path to input file (GRIB2, GeoTIFF, NetCDF, etc.) |
| `output_file` | Output path — extension sets format: `.jpg`, `.jpeg`, or `.png` |
| `--u-band` | U-component band: **1-based index** (default: `1`) or GRIB metadata string such as `GRIB_ELEMENT=UGRD` |
| `--v-band` | V-component band: **1-based index** (default: `2`) or GRIB metadata string such as `GRIB_ELEMENT=VGRD` |
| `--min-value` | Fixed min for normalization of **both** u and v (default: `-64`) |
| `--max-value` | Fixed max for normalization of **both** u and v (default: `64`) |

Use u/v band specs from **Step 2** investigation. Set `--min-value` / `--max-value` to the physical range the user chose (e.g. −50 to 50 m/s).

## Example

```bash
python pipeline/grib2_uv_to_image_with_fix_min_max.py reprojected.grib2 wind.png \
  --u-band 1 --v-band 2 \
  --min-value -50 --max-value 50
```

## Output

- **JPEG/PNG** with R = normalized u, G = normalized v, B = valid/NA mask (B = 0 for NA, B = 255 for valid).
- **`bounds_<output_stem>.txt`** beside the image — one line: **`minX,maxY,maxX,minY`** (e.g. `wind.png` → `bounds_wind.txt`).
