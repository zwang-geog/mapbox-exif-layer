# Weather GeoTIFF preprocessing

Use when Step 3 chose **GeoTIFF** delivery. Produces float32 GeoTIFF file(s) in **EPSG:4326** for `SmoothRaster`.

Install GDAL first: [install_pipeline_dependency.md](install_pipeline_dependency.md).

Use **scalar band indices from Step 2** in the `-b` flags below (GDAL band indices are **1-based**).

Packaging follows Step 3:

| Step 3 packaging | Output |
|------------------|--------|
| `geotiff-single-band` | One GeoTIFF per weather variable per timestep |
| `geotiff-multi-band` | One GeoTIFF per timestep with each variable as a separate band |

## 1. Reproject and convert to float32

### Single-band (one scalar field per file)

```bash
gdalwarp -t_srs EPSG:4326 -dstnodata -9999 -ot Float32 -overwrite \
  -b <scalar_band> \
  input.grib2 temperature.tif
```

Example (temperature in GDAL band 1):

```bash
gdalwarp -t_srs EPSG:4326 -dstnodata -9999 -ot Float32 -overwrite \
  -b 1 \
  input.grib2 temperature.tif
```

### Multi-band (several variables in one file)

List one `-b` per variable **in band order**. Record which band index maps to which variable.

```bash
gdalwarp -t_srs EPSG:4326 -dstnodata -9999 -ot Float32 -overwrite \
  -b <temp_band> -b <rh_band> -b <precip_band> \
  input.grib2 weather.tif
```

Example (temperature band 1, relative humidity band 2, precipitation band 3):

```bash
gdalwarp -t_srs EPSG:4326 -dstnodata -9999 -ot Float32 -overwrite \
  -b 1 -b 2 -b 3 \
  input.grib2 weather.tif
```

For **multi-timestep**, use a shell script to process each input file. Adapt the output filename pattern to your naming convention (e.g. `weather_01.tif`, `weather_02.tif`, ...):

**Single-band multi-timestep:**

```bash
#!/usr/bin/env bash
set -euo pipefail

BAND=1  # scalar band index (1-based)
i=1
for f in /path/to/grib2/files/*.grib2; do
  gdalwarp -t_srs EPSG:4326 -dstnodata -9999 -ot Float32 -overwrite \
    -b "$BAND" \
    "$f" "temperature_$(printf '%02d' $i).tif"
  (( i++ ))
done
```

**Multi-band multi-timestep:**

```bash
#!/usr/bin/env bash
set -euo pipefail

i=1
for f in /path/to/grib2/files/*.grib2; do
  gdalwarp -t_srs EPSG:4326 -dstnodata -9999 -ot Float32 -overwrite \
    -b 1 -b 2 -b 3 \
    "$f" "weather_$(printf '%02d' $i).tif"
  (( i++ ))
done
```

Adjust the glob pattern, band indices, and output prefix to match the actual data.

### Useful flags

| Flag | Purpose |
|------|---------|
| `-t_srs EPSG:4326` | Reproject to WGS 84 (required by this package) |
| `-dstnodata` *value* | Standardize the output no-data value (e.g. `-dstnodata -9999`). Not required to be `-9999`; use any sentinel your pipeline agrees on. Recommended so the written GeoTIFF has one consistent no-data value even when the source uses something else |
| `-ot Float32` | Output sample type. This package assumes float32 on the GPU; other types (e.g. `Float64`) are converted, which can lose precision |
| `-te xmin ymin xmax ymax` | Optional crop to a geographic extent (west, south, east, north in degrees once reprojected). Omit if the full input raster should be rendered |
| `-b` | Subset bands to keep the output file as small as possible. GDAL band indices are **1-based**. |
| `-overwrite` | Replace `output.tif` if it already exists; omit this flag to fail when the output path is taken |

See [gdalwarp documentation](https://gdal.org/en/stable/programs/gdalwarp.html) for resampling (`-r`), output resolution (`-tr`, `-outsize`), and other options.

## 2. Compress

GeoTIFF output is uncompressed by default. Compress after `gdalwarp` to produce a smaller file:

```bash
gdal_translate warped.tif warped_zstd.tif -co COMPRESS=ZSTD
```
