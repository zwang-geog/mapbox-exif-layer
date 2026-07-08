# Wind GeoTIFF preprocessing

Use when Step 3 chose **GeoTIFF** delivery. Produces a float32 GeoTIFF in **EPSG:4326** for `ParticleMotion`.

Install GDAL first: [install_pipeline_dependency.md](install_pipeline_dependency.md).

Use u/v **band indices from Step 2** in the `-b` flags below (GDAL band indices are **1-based**).

## 1. Reproject and convert to float32

```bash
gdalwarp -t_srs EPSG:4326 -dstnodata -9999 -ot Float32 -overwrite \
  -b <u_band> -b <v_band> \
  input.grib2 warped.tif
```

Example (u in band 1, v in band 2):

```bash
gdalwarp -t_srs EPSG:4326 -dstnodata -9999 -ot Float32 -overwrite \
  -b 1 -b 2 \
  input.grib2 warped.tif
```

### Useful flags

| Flag | Purpose |
|------|---------|
| `-t_srs EPSG:4326` | Reproject to WGS 84 (required by this package) |
| `-dstnodata` *value* | Standardize the output no-data value (e.g. `-dstnodata -9999`). Not required to be `-9999`; use any sentinel your pipeline agrees on. Recommended so the written GeoTIFF has one consistent no-data value even when the source uses something else |
| `-ot Float32` | Output sample type. This package assumes float32 on the GPU; other types (e.g. `Float64`) are converted, which can lose precision |
| `-te xmin ymin xmax ymax` | Optional crop to a geographic extent (west, south, east, north in degrees once reprojected). Omit if the full input raster should be rendered |
| `-b` | When the input has more bands than needed, subset with `-b` to keep the output file as small as possible. GDAL band indices are **1-based**. |
| `-overwrite` | Replace `output.tif` if it already exists; omit this flag to fail when the output path is taken |

See [gdalwarp documentation](https://gdal.org/en/stable/programs/gdalwarp.html) for resampling (`-r`), output resolution (`-tr`, `-outsize`), and other options.

## 2. Compress

GeoTIFF output is uncompressed by default. Compress after `gdalwarp` to produce a smaller file:

```bash
gdal_translate warped.tif warped_zstd.tif -co COMPRESS=ZSTD
```
