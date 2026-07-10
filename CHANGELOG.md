# Changelog

All notable changes to this project are documented in this file.

## v1.3.4

- **ParticleMotion dateline handling:** For global wind extents whose longitude span rounds to at least 360° (e.g. `[-180.5, 90.5, 179.5, -90.5]`), particles now wrap east/west across the antimeridian instead of resetting to a random position. Regional extents (span < 360°) still reset at left/right boundaries. Wrap behavior is auto-detected from bounds when the source is set and passed to the update shader via `wrapLongitude`.

## v1.3.3

- **RGB / RGBA GeoTIFF:** Added `RgbGeoTiff` — a helper (not a custom WebGL layer) that fetches an RGB or RGBA GeoTIFF in the browser, decodes it client-side, and adds a native Mapbox/MapLibre **`image` source** and **`raster` layer**. Geographic extent is read from the file; no `bounds` option is required. Supports EPSG:4326, PhotometricInterpretation **2** (RGB), uint8 or uint16 bands (16-bit normalized to 8-bit for display), and optional alpha (4-band RGBA). Use `addTo(map)` after the map loads and `remove()` to tear down the layer and revoke the internal blob URL. Requires the optional peer dependency `geotiff`.
- **Docs:** Added [`docs/rgb-geotiff.md`](docs/rgb-geotiff.md). Updated [`docs/geotiff-source.md`](docs/geotiff-source.md) with a scalar vs RGB GeoTIFF decision table. README and official site updated for the four use-case layout.
- **Demo:** Plain HTML example — [`maplibre-gl-demo/rgba-geotif-demo`](maplibre-gl-demo/rgba-geotif-demo/).

## v1.3.2

- **JPEG/PNG without EXIF:** Added optional constructor parameters for sources that omit EXIF `ImageDescription` min/max metadata. `SmoothRaster` accepts `scalarValueRange` (`[min, max]`) to map encoded R-band values to physical units for the colormap. `ParticleMotion` accepts `velocityRange` (`[min, max]`, in the layer `unit`) to de-normalize u and v from the R and G bands; wind speed coloring without EXIF is inferred from `color` stops (as with GeoTIFF). When EXIF is present, it takes precedence over these options.
- **Pipeline:** Added `grib2_scalar_to_image_with_fix_min_max.py` and `grib2_uv_to_image_with_fix_min_max.py` for fixed-range JPEG/PNG encoding without EXIF. Simplified `grib2_to_image.py` to always write EXIF-enabled JPEG.
- **Docs:** Expanded [`docs/jpeg-source.md`](docs/jpeg-source.md) with Method 1 (constructor value ranges) and Method 2 (EXIF) workflows.

## v1.3.1

- **Fixed GeoTIFF north–south flip:** Removed `UNPACK_FLIP_Y_WEBGL` when uploading float32 GeoTIFF textures. The extra Y flip did not match how JPEG sources are oriented and caused both `SmoothRaster` and `ParticleMotion` to display GeoTIFF data mirrored on the map.
- **Fixed MapLibre globe mesh subdivision:** Corrected latitude span calculation in `computeGlobeSubdivisions` (`maxY − minY` instead of `minY − maxY`) so globe mesh density matches the geographic extent.
- **User `bounds` normalization:** Constructor `bounds` are now auto-corrected to `[minX, maxY, maxX, minY]` when longitude or latitude min/max are accidentally swapped. GeoTIFF file bounds are unchanged.

## v1.3.0

- Added optional GeoTIFF source support (float32, EPSG:4326): configurable bands (`scalarBand`, `uBand`/`vBand`), GDAL NoData → NaN, uploads `R32F` / `RG32F`. Scalar and wind colormap scale from color-stop min/max (clamped), not data min/max. Requires optional peer dependency `geotiff` (^2.1.0 or ^3.0.0).

## v1.2.1

- Removed dependency on `mapbox-gl` (dropped `Evented` inheritance); install either `mapbox-gl` or `maplibre-gl` as a peer

## v1.2.0

- Added MapLibre GL JS 5.0.0+ custom layer support, adapted with MapLibre GL JS's globe projection

## v1.1.0

- Changed the B-band handling strategy by encoding null/no-data mask to B-band

## v1.0.3

- Added `slot` parameter to the constructor
- Added `cacheOption` parameter to the constructor

## v1.0.2

- Removed unused particle trail fading related parameters
- Added TypeScript definition

## v1.0.1

- Migrated the code to a different GitHub account for open source publishing
