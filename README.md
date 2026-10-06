# Mapbox EXIF Layer

[![npm version](https://img.shields.io/npm/v/mapbox-exif-layer)](https://www.npmjs.com/package/mapbox-exif-layer)

Mapbox GL JS / MapLibre GL JS custom layers for wind particles, smooth weather rasters from JPEG/PNG, and client-side scalar or RGB GeoTIFF visualization — no tile server required.

Official site: [https://www.mapbox-exif-layer.com/](https://www.mapbox-exif-layer.com/)

## At a glance

Four use cases. `SmoothRaster` covers two of them. Wind can use `ParticleMotion` or `NewParticleMotion`.

| Use case | Class | Data Source | Visual |
| --- | --- | --- | --- |
| Wind | `ParticleMotion`, or [`NewParticleMotion`](#newparticlemotion) (beta, v1.4.0) which keeps particles in the current view | [JPEG/PNG](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/jpeg-source.md), [scalar GeoTIFF](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/geotiff-source.md) | Flowing particle animation |
| Smooth weather display | `SmoothRaster` | [JPEG/PNG](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/jpeg-source.md) only | Smooth gradients (linear texture filtering) |
| Scalar GeoTIFF preview | `SmoothRaster` | [Scalar GeoTIFF](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/geotiff-source.md) | Native grid resolution; blocky when zoomed in |
| RGB / RGBA GeoTIFF | `RgbGeoTiff` | [RGB GeoTIFF](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/rgb-geotiff.md) | True-color image layer |

* Native [custom layer](https://docs.mapbox.com/mapbox-gl-js/api/properties/#customlayerinterface) integration (Mapbox GL JS or MapLibre GL JS) — not a canvas overlay
* **No tile server** — serve a static JPEG/PNG or GeoTIFF from a URL (e.g. S3); JPEG/PNG must be a [properly encoded weather grid](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/jpeg-source.md), not an arbitrary photo
* **MapLibre globe projection (v1.2.0+)** — set `mapRuntime: 'maplibre'` on each layer; see [maplibre-gl-demo](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/maplibre-gl-demo/maplibre-gl-demo/src/App.jsx)
* **GPU-accelerated** wind particles via transform feedback — no per-frame CPU loop over hundreds of thousands of points

### Demos

* [Weather map time slider demo](https://www.weather-map-time-slider-demo.mapbox-exif-layer.com) ([source](maplibre-gl-demo/global-gfs-slider/src/App.jsx))
* [MapLibre country-scale globe demo (masked no-data cells)](https://www.mapbox-exif-layer.com/maplibre-gl-js-globe-projection-demo/index.html) ([source](maplibre-gl-demo/maplibre-gl-demo/src/App.jsx))
* [US wind & temperature demo with Mapbox](https://www.us-wind-particle-map-demo.mapbox-exif-layer.com) ([source](react-demo/react-demo/src/App.jsx))
* [Demo video — Southern California wind particles](https://www.youtube.com/watch?v=HLu0Ylhu5x4)
* [Demo video — US continental wind particle animation (v1.1.0)](https://www.youtube.com/watch?v=iWKjNriTW-U)
* [Demo video — MapLibre GL JS globe projection (v1.3.1)](https://www.youtube.com/watch?v=SLPBfteIbRE)
* [Technique explanation (Medium)](https://medium.com/@zifanw9/a-low-cost-custom-wind-particle-motion-layer-in-mapbox-gl-js-9a51978e3ffb)

### Quick starts

Step-by-step guides by use case and map runtime:

| Use case | Mapbox GL JS | MapLibre GL JS |
| --- | --- | --- |
| Wind | [Guide](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/claude-skill-plugin/skills/wind-particles/references/add-wind-particle-mapbox.md) | [Guide](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/claude-skill-plugin/skills/wind-particles/references/add-wind-particle-maplibre.md) |
| Smooth weather / scalar GeoTIFF | [Guide](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/claude-skill-plugin/skills/weather-raster/references/add-weather-raster-mapbox.md) | [Guide](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/claude-skill-plugin/skills/weather-raster/references/add-weather-raster-maplibre.md) |
| RGB GeoTIFF | [Guide](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/rgb-geotiff.md) | [Guide](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/rgb-geotiff.md) |

> **GeoTIFF support (v1.3.1+).** `ParticleMotion` and `SmoothRaster` accept scalar GeoTIFF sources (float32, EPSG:4326) in addition to JPEG/PNG. GeoTIFF rasters use physical cell values directly and do not require 0–255 normalization. See [docs/geotiff-source.md](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/geotiff-source.md). JPEG encoding is in [docs/jpeg-source.md](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/jpeg-source.md).

> **JPEG/PNG without EXIF (v1.3.2+).** For normalized JPEG or PNG files that omit EXIF `ImageDescription` min/max metadata, pass `scalarValueRange` on `SmoothRaster` or `velocityRange` on `ParticleMotion`. When EXIF is present, EXIF takes precedence. See [docs/jpeg-source.md](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/jpeg-source.md).

## GFS 0.25° Free Open Data (update every 6 hours)

Using or experimenting with this package requires a proper data source. To facilitate that, I process and distribute global weather forecasts of wind (m/s), temperature (°C), and relative humidity (%) EXIF JPEGs for free public use (both non-commercial and commercial, with attribution). The raw forecast data come from [NOAA GFS](https://www.ncei.noaa.gov/products/weather-climate-models/global-forecast), and anyone using those EXIF JPEGs should add custom attribution to credit NOAA and mapbox-exif-layer.

**Base URL:** `https://www.mapbox-exif-layer.com/gfs/0p25`

| Subfolder (var) | NOAA field | Layer | Units |
| --- | --- | --- | --- |
| `wind/` | 10 m UGRD + VGRD | `ParticleMotion` (`unit: 'mps'`) | m/s |
| `temperature/` | 2 m TMP | `SmoothRaster` | °C |
| `rh/` | 2 m RH | `SmoothRaster` | % |

JPEG file names use `{var}_{YYYYMMDDHH}.jpeg`, where `HH` is 00–23 UTC. The URL pattern is:

```
https://www.mapbox-exif-layer.com/gfs/0p25/{wind|temperature|rh}/{var}_{YYYYMMDDHH}.jpeg
```

Example: `https://www.mapbox-exif-layer.com/gfs/0p25/rh/rh_2026100305.jpeg`

GFS 0.25° consists of hourly forecast for hours 0–120 (121 timesteps) and 3-hour forecast for hours 123–384 (88 timesteps). It updates every 6 hours. `status.json` encodes which hourly vs 3-hour valid times are in the current cycle, which is useful for a time slider:

```
https://www.mapbox-exif-layer.com/gfs/0p25/status.json
```

| Field | Meaning |
| --- | --- |
| `status` | `"complete"` when `f384` is present, otherwise `"partial"` |
| `grid` | `"0p25"` |
| `cadence` | `"hourly-then-3-hourly"` |
| `variables` | `["wind", "temperature", "rh"]` |
| `units` | `wind`: `m s-1`, `temperature`: `degC`, `rh`: `%` |
| `available_from` / `_unix` | Cycle `init` minus 96 h (suggested lookback, not an object inventory) |
| `init` / `init_unix` | Cycle initialization time (UTC) |
| `hourly_until` / `_unix` | Last **hourly** valid time (`f120` when the cycle is complete) |
| `three_hourly_until` / `_unix` | Last valid time written for this cycle (`f384` when complete) |
| `bounds` | `[-180, 90, 180, -90]` |

The pipeline does not delete old JPEGs. An S3 lifecycle rule expires objects about 6 days after last modification, so valid times before `init` are not guaranteed.

Build slider timestamps as hourly steps from `init_unix` through `hourly_until_unix`. A MapLibre globe demo is [`maplibre-gl-demo/global-gfs-slider`](maplibre-gl-demo/global-gfs-slider/src/App.jsx).

To run the same NOAA → JPEG conversion on your own schedule (cron, EventBridge, or similar), see [`pipeline/gfs`](pipeline/gfs) (`run_gfs.py`, plus `ecs-fargate.yaml` if you want a Fargate example).

## Installation

This package does not include a map SDK. Install **one** of the following, depending on which runtime you use:

**Mapbox GL JS** (default `mapRuntime: 'mapbox'`):

```bash
npm install mapbox-gl
```

**MapLibre GL JS** (set `mapRuntime: 'maplibre'` on each layer):

```bash
npm install maplibre-gl
```

> **Map projection.** **Mapbox GL JS** — set `projection: 'mercator'` when initializing the map (default `mapRuntime: 'mapbox'` does not support globe). **MapLibre GL JS** — set `mapRuntime: 'maplibre'` on every layer; globe projection (v1.2.1+) via `map.setProjection({ type: 'globe' })`. See [`maplibre-gl-demo`](maplibre-gl-demo/maplibre-gl-demo/src/App.jsx).

Then install this package:

```bash
npm install mapbox-exif-layer
```

If you use **GeoTIFF** sources (`.tif` / `.tiff`), also install the optional peer dependency:

```bash
npm install geotiff
```

JPEG-only setups do not need `geotiff`.

Then import the layer classes in your JavaScript code:
```javascript
import { ParticleMotion, SmoothRaster, RgbGeoTiff } from 'mapbox-exif-layer';
```

## Quick start

Minimal wind layer example (assumes EXIF `ImageDescription` on the JPEG — see [docs/jpeg-source.md](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/jpeg-source.md#method-2-dynamic-dataset-dependent-minmax-values); without EXIF, pass `velocityRange` per [Method 1](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/jpeg-source.md#method-1-constant-dataset-independent-minmax-values)):

```javascript
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/dark-v11',
  zoom: 7,
  center: [-119.699944, 34.432546],
  projection: 'mercator'  // mapbox-gl-js: use mercator (not globe)
});

const windLayer = new ParticleMotion({
  id: 'wind-particle',
  source: 'path/to/wind.jpeg',  // or a .tif / .tiff GeoTIFF URL
  color: [[0, [0, 195, 255]], [20, [249, 243, 1]], [42, [128, 0, 0]]],  // [speed, [r,g,b]] — see react-demo for full palettes
  unit: 'mph',
  bounds: [-121, 36, -117, 32],  // required for JPEG/PNG; optional for GeoTIFF (read from file)
  readyForDisplay: true
});

map.on('load', () => map.addLayer(windLayer));
```

**More examples**

* **Per use case** — [Quick starts](#quick-starts) table above
* **Multi-layer app** — [`react-demo/react-demo`](react-demo/react-demo) (wind + temperature + humidity + precipitation)
* **Time slider** — [`maplibre-gl-demo/global-gfs-slider`](maplibre-gl-demo/global-gfs-slider/src/App.jsx) (GFS 0.25° on MapLibre globe)
* **MapLibre globe + GeoTIFF** — [`maplibre-gl-demo/maplibre-gl-demo`](maplibre-gl-demo/maplibre-gl-demo/src/App.jsx) (set `mapRuntime: 'maplibre'` on each layer)
* **RGB GeoTIFF** — [`RgbGeoTiff`](#rgbgeotiff) below and [`docs/rgb-geotiff.md`](docs/rgb-geotiff.md)

For `readyForDisplay`, `setSource`, visibility toggling, and MapLibre globe setup, see the [API reference](#available-class-reference) below and [Quick starts](#quick-starts) above.

## TypeScript Usage

`mapbox-exif-layer` ships a typed constructor so your options are checked at compile time. However, the current type declarations do not formally implement `CustomLayerInterface` from either `mapbox-gl` or `maplibre-gl` — because the `render` method signature differs between the two runtimes at runtime and cannot be expressed as a single static type without being incorrect for one of them.

**Workaround:** cast the layer instance when passing it to `map.addLayer`:

```typescript
// MapLibre GL JS
map.addLayer(particleLayer as unknown as maplibregl.CustomLayerInterface);
map.addLayer(weatherLayer as unknown as maplibregl.CustomLayerInterface);

// Mapbox GL JS
map.addLayer(particleLayer as unknown as mapboxgl.CustomLayerInterface);
map.addLayer(weatherLayer as unknown as mapboxgl.CustomLayerInterface);
```

This cast is safe — both `ParticleMotion` and `SmoothRaster` implement the interface correctly at runtime.

## Available Class Reference

### ParticleMotion

A particle-based visualization layer that creates animated particles for wind direction and speed visualization. Supports **JPEG/PNG image** sources with u/v velocities encoded in the R and G bands (see [docs/jpeg-source.md](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/docs/jpeg-source.md)), and **GeoTIFF** sources with u- and v-component velocity stored in separate bands (see [docs/geotiff-source.md](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/docs/geotiff-source.md)).

#### Options

- `id` (string): **(required)** Unique layer ID
- `source` (string): **(required)** URL of JPEG/PNG image or GeoTIFF file (`.tif` / `.tiff`; GeoTIFF requires optional peer package dependency `geotiff`)
- `bounds` (array): **JPEG/PNG image only (required).** Extent as `[minX, maxY, maxX, minY]` (longitude −180…180, latitude −90…90). GeoTIFF source will read bounds from the file directly and ignore this parameter.
- `color` (array): **(required)** Array of color stops `[value, [r, g, b]]`. Values do not have to be ordered since sorting is performed internally by the package.
- `unit` (string): **(required)** When the source is a **GeoTIFF** file, the unit of the u- and v-component velocities stored in the bands. When the source is **EXIF JPEG**, the unit of the min/max velocity and speed values in the EXIF information. Must be consistent with the wind-speed units in the `color` parameter. Can be one of:
  - `'mph'` (default): Miles per hour
  - `'kph'`: Kilometers per hour
  - `'mps'`: Meters per second
- `velocityRange` (array): **Dataset-independent normalized JPEG/PNG only (required).** Two-element `[min, max]` in the layer `unit` option. Used to de-normalize u and v from the R and G bands when the JPEG/PNG source has no EXIF velocity metadata; applied to both u- and v- components. Ignored when valid EXIF metadata is present. Speed coloring without EXIF is inferred from `color` stops, not from this range. See [jpeg-source.md](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/docs/jpeg-source.md).
- `readyForDisplay` (bool): Preventing the layer from rendering when the layer is added to the map, if necessary (default: false)
- `particleCount` (number): Number of particles to render (default: 5000). Suggested values by extent: ~5000 for a small area (e.g. Southern California), ~10000 for the continental United States, ~100000 for global coverage.
- `ageThreshold` (number): Age threshold before particle position reset probability increases, in **position-update steps** (default: 500), not seconds. Age increments once each time the update shader runs; real-world timing depends on `updateInterval` (e.g. 500 steps at 50 ms ≈ 25 s, but at 20 ms ≈ 10 s). A smaller `updateInterval` makes this threshold take effect sooner unless you raise `ageThreshold` proportionally. For global wind patterns, use a larger value than the default. This prevents particles from degenerating into circular/looped patterns.
- `maxAge` (number): Maximum age before a particle position is forced to reset, in **position-update steps** (default: 1000), with the same `updateInterval` dependency as `ageThreshold`. If you decrease `updateInterval`, increase `maxAge` accordingly to preserve similar lifetimes; for global wind patterns, use a larger value than the default. This prevents particles from degenerating into circular/looped patterns.
- `updateInterval` (number): Minimum time between particle position updates, in ms (default: 50, i.e. ~20 updates per second). Lower values update positions more often, increasing apparent motion speed. Prefer tuning this before `velocityFactor`. Because it is a plain instance property, you can also adjust it at runtime — for example in a map `zoomend` listener: use a smaller `updateInterval` at lower zoom levels (larger visible extent) so particles update more times per second and flow patterns remain readable when zoomed out.
- `velocityFactor` (number): Multiplier applied to each particle's normalized displacement on every position update (default: 0.05). It scales step size per update, not per render frame; velocity is sampled once at the particle's current grid cell each step. Values that are too large can make particles jump across multiple grid cells and miss intermediate flow detail.
- `pointSize` (number): Size of particles in pixels (default: 5.0)
- `fadeOpacity` (number): Global opacity for particles (default: 0.9)
- `trailLength` (number): Number of trailing particles (default: 3)
- `trailSizeDecay` (number): How quickly point size decreases for trail particles (default: 0.8)
- `cacheOption` (string): [Cache option](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache) to use when fetching the source image. It can be one of no-cache (default), no-store, reload, default, or force-cache.
- `slot` (string): Optional [slot](https://docs.mapbox.com/style-spec/reference/slots/) identifier for the layer (used by Mapbox GL JS for [layer ordering](https://docs.mapbox.com/mapbox-gl-js/api/map/#addlayer-parameters-layer-slot)); typical values may include "top", "middle" (recommended), "bottom".
- `mapRuntime` (string): **(required for MapLibre)** `'mapbox'` (default) or `'maplibre'`. This parameter must be explicitly set to `'maplibre'` if maplibre-gl-js SDK is used. Only `'maplibre'` with [MapLibre GL JS](https://maplibre.org/projects/gl-js/) supports globe projection.
- `sourceType` (string): `'auto'` (default), `'jpeg'`, or `'geotiff'`. GeoTIFF requires optional peer package dependency [geotiff](https://www.npmjs.com/package/geotiff); see [geotiff-source.md](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/docs/geotiff-source.md).
- `uBand` (number): **GeoTIFF only.** GeoTIFF sample index for the u component (default: `0`, first band).
- `vBand` (number): **GeoTIFF only.** GeoTIFF sample index for the v component (default: `1`, second band).

#### Methods

- `setSource(source, percentParticleWhenSetSource = 0.5)` : Changes the source URL (JPEG or GeoTIFF), and optionally the proportion of particles whose positions must be reset when the source is updated (default half of the particles). The layer will repaint automatically.

### NewParticleMotion

The classic `ParticleMotion` layer distributes wind particles across the entire data extent. For example, when rendering a global wind forecast, many particles will be concentrated in high-wind areas such as cyclones, atmospheric rivers, or over ocean, while few or no particles will be present in areas with calmer wind, such as inland. Zooming into an inland area will not affect particle positions, and the user will likely see few or no particles in the map viewport. If the user wants to explore the wind direction and speed in such a calmer area, then there is a problem.

To address this, an alternative particle motion layer is currently implemented as the `NewParticleMotion` class (v1.4.0+).

`NewParticleMotion` differs from `ParticleMotion` in three ways.

1. **Particle position is viewport dependent:** Particle positions are constrained to the data extent and to the map viewport (with an 8% buffer around the viewport). There are two implications. First, when the user pans or zooms (on the `moveend` event), particle positions are randomly reset to be inside or around the viewport. Zooming out relies on this reset: until `moveend`, particles stay in the smaller region they already occupied. Second, the boundary that triggers a new position changes. A particle is reset when it reaches the viewport, rather than when it reaches the edge of the data extent. After the viewport changes, that boundary is what the motion keeps using: a particle that travels past it is placed back inside or around the viewport.

2. **Particle count as a function of zoom level:** At a small zoom level with a large extent, a large number of particles is necessary to depict wind patterns. At a large zoom level with a small extent, a small number of particles is necessary to avoid overcrowding. The `particleCount` parameter also accepts a function that takes zoom and returns the desired count in and around the viewport. When `particleCount` is omitted, the default function returns these counts at integer zoom levels.

| Zoom | Default count |
| --- | --- |
| 13 and above | 10 |
| 12 | 4,000 |
| 11 | 4,229 |
| 10 | 4,472 |
| 9 | 4,729 |
| 8 | 5,000 |
| 7 | 5,946 |
| 6 | 7,071 |
| 5 | 8,409 |
| 4 | 10,000 |
| 3 | 31,623 |
| 2 and below | 100,000 |

3. **Uniform tails:** Each trail dot sits a fixed screen step upwind, `0.8 × pointSize` pixels, so a slow particle and a fast one draw the same streak. Direction still follows the wind at the head, and the streak uses that head's color. `velocityFactor` still scales how far the head moves on each position update, but it no longer scales the tail. The benefit of this change is that the wind direction of low-speed particles becomes more prominent at a small zoom level. In contrast, `ParticleMotion` places trail dots a multiple of the last motion step back, so faster wind draws a longer tail.

Other constructor options and `setSource(source, percentParticleWhenSetSource = 0.5)` match `ParticleMotion`.

This `NewParticleMotion` class is experimental. It puts a heavier emphasis on the picture, while `ParticleMotion` is the better fit for simulating how air might actually move given the u- and v- velocity fields.

### SmoothRaster

A custom raster layer for scalar fields (temperature, humidity, precipitation, etc.). 

With a **JPEG/PNG image** source, the grid is uploaded as an RGBA texture with linear filtering; the GPU bilinearly interpolates between adjacent texel values when sampling, producing a smooth, non-blocky gradient. See [docs/jpeg-source.md](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/docs/jpeg-source.md).

With a **GeoTIFF** source, a small single-band file (or one band from a multi-band file) is read directly in the browser and colormapped via the shader — useful when you want a GIS-friendly pipeline without custom image encoding, though the display tends to look blockier at native grid resolution than the image path. See [docs/geotiff-source.md](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/docs/geotiff-source.md).

#### Options

- `id` (string): **(required)** Unique layer ID
- `source` (string): **(required)** URL of an JPEG/PNG image or GeoTIFF file (`.tif` / `.tiff`; GeoTIFF requires optional peer package dependency `geotiff`)
- `color` (array): **(required)** Array of color stops `[value, [r, g, b]]`. Values do not have to be ordered since sorting is performed internally by the package. An optional A-band (opacity) value can also be specified, but interpolation will not be applied to A-band. A-band is useful for rendering precipitation by setting all zero or near-zero precipitation cells completely transparent (see [react-demo/real-time-example](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/react-demo/real-time-example/src/util.jsx)).
- `bounds` (array): **JPEG/PNG image only (required).** Extent as `[minX, maxY, maxX, minY]` (longitude −180…180, latitude −90…90). GeoTIFF source will read bounds from the file directly and ignore this parameter.
- `opacity` (number): Layer global opacity (default: 1.0)
- `readyForDisplay` (bool): Preventing the layer from rendering when the layer is added to the map, if necessary (default: false)
- `cacheOption` (string): [Cache option](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache) to use when fetching the source image. It can be one of no-cache (default in 1.0.3), no-store (default in 1.0.2), reload, default, or force-cache.
- `slot` (string): Optional [slot](https://docs.mapbox.com/style-spec/reference/slots/) identifier for the layer (used by Mapbox GL JS for [layer ordering](https://docs.mapbox.com/mapbox-gl-js/api/map/#addlayer-parameters-layer-slot)); typical values may include "top", "middle" (recommended), "bottom".
- `mapRuntime` (string): **(required for MapLibre)** `'mapbox'` (default) or `'maplibre'`. This parameter must be explicitly set to `'maplibre'` if maplibre-gl-js SDK is used. Only `'maplibre'` with [MapLibre GL JS](https://maplibre.org/projects/gl-js/) supports globe projection.
- `sourceType` (string): `'auto'` (default), `'jpeg'`, or `'geotiff'`. GeoTIFF requires optional peer package dependency [geotiff](https://www.npmjs.com/package/geotiff); see [`docs/geotiff-source.md`](docs/geotiff-source.md).
- `scalarBand` (number): **GeoTIFF only.** Optional GeoTIFF sample index (0-based band index) for scalar data (default: `0`, first band).
- `scalarValueRange` (array): **Dataset-independent normalized JPEG/PNG only (required).** Two-element `[min, max]` matching the physical range used when encoding the R band; maps encoded values to physical units for the colormap when EXIF scalar metadata is absent from JPEG/PNG image soruce (this parameter is ignored when EXIF is present). `color` stop values should use the same physical units. See [docs/jpeg-source.md](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/docs/jpeg-source.md).

#### Methods

- `setSource(source, color=null)` : Changes the source URL (JPEG or GeoTIFF), and optionally color array (default is to use the same color array as before). The layer will repaint automatically.

### RgbGeoTiff

Displays an **RGB or RGBA GeoTIFF (PhotometricInterpretation=2)** as a native Mapbox/MapLibre `image` source and `raster` layer. Unlike `ParticleMotion` and `SmoothRaster`, this is not a custom WebGL layer — the GeoTIFF is decoded client-side into a PNG blob URL, then added to the map with the built-in raster layer type. Bounds are read from the file; no `bounds` option is required.

**Requirements:** EPSG:4326, uint8 or uint16 bands, peer package [geotiff](https://www.npmjs.com/package/geotiff). See [docs/rgb-geotiff.md](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/docs/rgb-geotiff.md).

```javascript
import { RgbGeoTiff } from 'mapbox-exif-layer';

const rgbLayer = new RgbGeoTiff({
  id: 'aerial-photo',
  source: 'path/to/photo.tif',
  opacity: 0.9
});

map.on('load', () => {
  rgbLayer.addTo(map);
});

// later:
rgbLayer.remove();
```

#### Options

- `id` (string): **(required)** Layer ID. Also used as the base for the internal image source ID (`${id}-rgb-source`).
- `source` (string): **(required)** URL of an RGB or RGBA GeoTIFF file (`.tif` / `.tiff`; requires optional peer package `geotiff`).
- `opacity` (number): Raster layer opacity (default: `1.0`).
- `cacheOption` (string): [Cache option](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache) to use when fetching the GeoTIFF. Can be one of `no-cache` (default), `no-store`, `reload`, `default`, or `force-cache`.
- `slot` (string): Optional [slot](https://docs.mapbox.com/style-spec/reference/slots/) identifier for the layer (Mapbox GL JS v3 layer ordering); typical values include `"top"`, `"middle"`, `"bottom"`.
- `beforeLayerId` (string): Optional existing layer ID. When set, the raster layer is inserted below that layer in the stack (same as the second argument to `map.addLayer`).

#### Methods

- `addTo(map)` : Fetches the GeoTIFF, decodes it, and adds the `image` source and `raster` layer to the map. Returns `this` for chaining. Call after the map has loaded (e.g. inside `map.on('load', ...)`).
- `remove()` : Removes the raster layer and image source from the map and revokes the internal blob URL to free memory.

Once added, the layer is a normal `raster` layer on the map. Use its `id` with the usual Mapbox/MapLibre APIs:

```javascript
// Toggle visibility
map.setLayoutProperty('aerial-photo', 'visibility', 'none');
map.setLayoutProperty('aerial-photo', 'visibility', 'visible');

// Change opacity at runtime
map.setPaintProperty('aerial-photo', 'raster-opacity', 0.5);
```

### GeoTIFF: preview vs production

> **Production note (scalar GeoTIFF preview & RGB GeoTIFF).** Loading the entire GeoTIFF in the browser is intended for **quick previews and small rasters** — not production maps at many zoom levels or over large extents. For production raster data display, recommend adding a standard Mapbox/MapLibre **raster tile source** instead:
>
> - **Pre-generated MBTiles** — build tiles with [rio-mbtiles](https://github.com/mapbox/rio-mbtiles) or QGIS **Raster → Generate XYZ Tiles (MBTiles)**, then serve with [mbtileserver](https://github.com/consbio/mbtileserver). For scalar GeoTIFF, assign RGB(A) colors from the attribute first (e.g. rasterio + NumPy) before generating the tileset.
> - **COG + tile server** — [TiTiler](https://github.com/developmentseed/titiler) (or GeoServer / similar) serves tiles directly from a Cloud Optimized GeoTIFF without pre-generating MBTiles.
> - **MapLibre serverless COG** — host a COG on static storage and use [maplibre-cog-protocol](https://github.com/geomatico/maplibre-cog-protocol) for range-request tiling in the client (no tile server).

## Acknowledgement

The shader utility code of this package is referencing from util.js of [mapbox/webgl-wind](https://github.com/mapbox/webgl-wind/blob/master/src/util.js). The idea of EXIF is credit to [sakitam-fdd/wind-layer](https://github.com/sakitam-fdd/wind-layer).

## License

MIT 