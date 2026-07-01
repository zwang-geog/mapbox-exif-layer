# Changelog

All notable changes to this project are documented in this file.

## Unreleased

- Added optional GeoTIFF source support (float32, EPSG:4326): configurable bands (`scalarBand`, `uBand`/`vBand`), GDAL NoData → NaN, uploads `R32F` / `RG32F`. Scalar and wind colormap scale from color-stop min/max (clamped), not data min/max. Requires optional peer dependency `geotiff` (^2.1.0 or ^3.0.0).
- Document `maplibre-gl` as an optional peer dependency alongside `mapbox-gl` (install one map renderer).

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
