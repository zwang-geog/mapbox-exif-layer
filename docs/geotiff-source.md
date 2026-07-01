# GeoTIFF source (float32, EPSG:4326)

GeoTIFF is an optional high-precision alternative to EXIF JPEG. Install the peer dependency when using it:

```bash
npm install geotiff
```

## Requirements

- **CRS:** EPSG:4326 (WGS 84). Reproject before use:
  ```bash
  gdalwarp -t_srs EPSG:4326 -dstnodata -9999 input.tif output_4326.tif
  ```
- **Sample type:** float32 (GDAL `Float32` / `-ot Float32`)
- **NoData:** set with `-dstnodata` or GDAL metadata; decoded pixels become `NaN` in the GPU texture
- **Layer `bounds`:** still supplied on the layer (must match the GeoTIFF geographic extent)

## Band layout

Band indices are **0-based** sample indices (same as `geotiff` `readRasters` `samples`).

| Layer | Option(s) | Default | GPU upload |
|-------|-----------|---------|------------|
| `SmoothRaster` | `scalarBand` | `0` (first band) | `R32F` |
| `ParticleMotion` | `uBand`, `vBand` | `0`, `1` | `RG32F` |

Wind values should use the same unit as the layer `unit` option (`mph`, `kph`, or `mps`).

## Colormap scale (GeoTIFF)

GeoTIFF values are stored in the GPU texture in **physical units**. Normalization for both layers uses the **min and max of your `color` stops**, not a scan of the raster. Values below or above that range clamp to the ends of the colormap.

- **`SmoothRaster`:** scalar value → colormap index
- **`ParticleMotion`:** wind speed `hypot(u, v)` → colormap index (after `unit` conversion to mph)

Use the same `color` array across timesteps so animation stays comparable.

## Examples

```javascript
new ParticleMotion({
  source: '/data/wind.tif',
  sourceType: 'geotiff',
  uBand: 1,
  vBand: 0,
  // ...
});
```

## Usage

Sources ending in `.tif` / `.tiff` are detected automatically, or set `sourceType: 'geotiff'` explicitly:

```javascript
import { ParticleMotion, SmoothRaster } from 'mapbox-exif-layer';

const windLayer = new ParticleMotion({
  id: 'wind',
  source: '/data/wind_uv.tif',
  sourceType: 'geotiff',
  color: WIND_COLOR,
  bounds: [-125, 50, -65, 24],
  unit: 'mph',
  mapRuntime: 'maplibre',
});

const tempLayer = new SmoothRaster({
  id: 'temperature',
  source: '/data/temperature.tif',
  sourceType: 'geotiff',
  color: TEMPERATURE_COLOR,
  bounds: [-125, 50, -65, 24],
});
```

## Create wind GeoTIFF from GRIB (example)

```bash
gdalwarp -t_srs EPSG:4326 -dstnodata -9999 -overwrite \
  -te -125 24 -65 50 reprojected.grib2 wind_uv.tif

# Ensure band 1 = U, band 2 = V (order from gdal_translate -b flags if needed)
```

## Create scalar GeoTIFF (example)

```bash
gdal_translate -ot Float32 -a_srs EPSG:4326 temperature.tif temperature_4326.tif
gdal_edit.py -a_nodata -9999 temperature_4326.tif
```

## Notes

- Max grid size is limited by `gl.MAX_TEXTURE_SIZE` (often 4096 or 8192). Downsample larger rasters with `gdalwarp -tr` or `-outsize`.
- Float32 textures use **nearest** filtering on the GPU; smooth display still comes from mesh interpolation (`SmoothRaster`) and particle integration (`ParticleMotion`).
- JPEG / EXIF sources are unchanged; GeoTIFF is opt-in via file extension or `sourceType`.
