# RGB GeoTIFF demo

Demonstrates `RgbGeoTiff` from `mapbox-exif-layer` using a plain HTML file — no npm, no build step.

## Requirements

- An RGB or RGBA GeoTIFF file in **EPSG:4326**, with **uint8 or uint16** bands.
- A local HTTP server (browsers block `fetch` on `file://` URLs).

## Run

Serve from the **repo root** (not this folder), so the local `src/` package is reachable:

```bash
# from the repo root
npx serve .
# or
python -m http.server
```

Then open:
```
http://localhost:3000/maplibre-gl-demo/rgba-geotif-demo/
```

## Setup

1. Copy your GeoTIFF into this folder as `sample.tif`.
2. Or update the `GEOTIFF_SOURCE` constant in `index.html` to point at your file.
3. Open the page — the map will zoom to the image bounds once it loads.

## How it works

Dependencies (`maplibre-gl` and `geotiff`) are loaded from CDN via an `importmap`.
The local `../../src/index.js` is imported directly as an ES module, so any changes
to the source are reflected immediately on page reload.
