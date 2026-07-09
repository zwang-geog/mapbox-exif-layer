# Mapbox EXIF Layer

[![npm version](https://img.shields.io/npm/v/mapbox-exif-layer)](https://www.npmjs.com/package/mapbox-exif-layer)

Mapbox GL JS / MapLibre GL JS custom layers for wind particles, smooth weather rasters from JPEG/PNG, and client-side scalar or RGB GeoTIFF visualization — no tile server required.

Official site: [https://www.mapbox-exif-layer.com/](https://www.mapbox-exif-layer.com/)

## At a glance

Three layer classes, four use cases:

| Use case | Class | Data Source | Visual |
| --- | --- | --- | --- |
| Wind | `ParticleMotion` | [JPEG/PNG](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/jpeg-source.md), [scalar GeoTIFF](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/geotiff-source.md) | Flowing particle animation |
| Smooth weather display | `SmoothRaster` | [JPEG/PNG](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/jpeg-source.md) only | Smooth gradients (linear texture filtering) |
| Scalar GeoTIFF preview | `SmoothRaster` | [Scalar GeoTIFF](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/geotiff-source.md) | Native grid resolution; blocky when zoomed in |
| RGB / RGBA GeoTIFF | `RgbGeoTiff` | [RGB GeoTIFF](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/rgb-geotiff.md) | True-color image layer |

**Per-use-case quick starts:** [Wind (Mapbox)](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/claude-skill-plugin/skills/wind-particles/references/add-wind-particle-mapbox.md) · [Wind (MapLibre)](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/claude-skill-plugin/skills/wind-particles/references/add-wind-particle-maplibre.md) · [Weather raster (Mapbox)](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/claude-skill-plugin/skills/weather-raster/references/add-weather-raster-mapbox.md) · [Weather raster (MapLibre)](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/claude-skill-plugin/skills/weather-raster/references/add-weather-raster-maplibre.md) · [RGB GeoTIFF](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/rgb-geotiff.md)

> **GeoTIFF support (v1.3.1+).** `ParticleMotion` and `SmoothRaster` accept scalar GeoTIFF sources (float32, EPSG:4326) in addition to JPEG/PNG. GeoTIFF rasters use physical cell values directly and do not require 0–255 normalization. See [docs/geotiff-source.md](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/geotiff-source.md). JPEG encoding is in [docs/jpeg-source.md](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/jpeg-source.md).

> **JPEG/PNG without EXIF (v1.3.2+).** For normalized JPEG or PNG files that omit EXIF `ImageDescription` min/max metadata, pass `scalarValueRange` on `SmoothRaster` or `velocityRange` on `ParticleMotion`. When EXIF is present, EXIF takes precedence. See [docs/jpeg-source.md](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/jpeg-source.md).

* Native [custom layer](https://docs.mapbox.com/mapbox-gl-js/api/properties/#customlayerinterface) integration (Mapbox GL JS or MapLibre GL JS) — not a canvas overlay
* **No tile server** — serve a static JPEG/PNG or GeoTIFF from a URL (e.g. S3); JPEG/PNG must be a [properly encoded weather grid](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/docs/jpeg-source.md), not an arbitrary photo
* **MapLibre globe projection (v1.2.0+)** — set `mapRuntime: 'maplibre'` on each layer; see [maplibre-gl-demo](https://github.com/zwang-geog/mapbox-exif-layer/tree/main/maplibre-gl-demo/maplibre-gl-demo/src/App.jsx)
* **GPU-accelerated** wind particles via transform feedback — no per-frame CPU loop over hundreds of thousands of points

**Demos**

* [US wind & temperature demo](https://www.us-wind-particle-map-demo.mapbox-exif-layer.com) ([source](react-demo/react-demo))
* [Weather map time slider demo](https://www.weather-map-time-slider-demo.mapbox-exif-layer.com) ([source](react-demo/real-time-example))
* [MapLibre GL JS globe projection demo](https://www.mapbox-exif-layer.com/maplibre-gl-js-globe-projection-demo/index.html) ([source](maplibre-gl-demo/maplibre-gl-demo))
* [Demo video — Southern California wind particles](https://www.youtube.com/watch?v=HLu0Ylhu5x4)
* [Demo video — US continental wind particle animation (v1.1.0)](https://www.youtube.com/watch?v=iWKjNriTW-U)
* [Demo video — MapLibre GL JS globe projection (v1.3.1)](https://www.youtube.com/watch?v=SLPBfteIbRE)
* [Technique explanation (Medium)](https://medium.com/@zifanw9/a-low-cost-custom-wind-particle-motion-layer-in-mapbox-gl-js-9a51978e3ffb)

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

* **Per use case** — quick-start guides linked in [At a glance](#at-a-glance) above
* **Multi-layer app** — [`react-demo/react-demo`](react-demo/react-demo) (wind + temperature + humidity + precipitation)
* **Time slider** — [`react-demo/real-time-example`](react-demo/real-time-example)
* **MapLibre globe + GeoTIFF** — [`maplibre-gl-demo/maplibre-gl-demo`](maplibre-gl-demo/maplibre-gl-demo) (set `mapRuntime: 'maplibre'` on each layer)
* **RGB GeoTIFF** — [`RgbGeoTiff`](#rgbgeotiff) below and [`docs/rgb-geotiff.md`](docs/rgb-geotiff.md)

For `readyForDisplay`, `setSource`, visibility toggling, and MapLibre globe setup, see the [API reference](#available-class-reference) below and quick-start guides linked in [At a glance](#at-a-glance) above.

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
- `color` (array): **(required)** Array of color stops `[value, [r, g, b]]`. Values do not have to be ordered since sorting is performed internally by the package.
- `bounds` (array): **JPEG/PNG image only (required).** Extent as `[minX, maxY, maxX, minY]` (longitude −180…180, latitude −90…90). GeoTIFF source will read bounds from the file directly and ignore this parameter.
- `readyForDisplay` (bool): Preventing the layer from rendering when the layer is added to the map, if necessary (default: false)
- `particleCount` (number): Number of particles to render (default: 5000)
- `velocityFactor` (number): Speed multiplier for particle motion (default: 0.05)
- `updateInterval` (number): Minimum time between particle updates in ms (default: 50)
- `pointSize` (number): Size of particles in pixels (default: 5.0)
- `fadeOpacity` (number): Global opacity for particles (default: 0.9)
- `trailLength` (number): Number of trailing particles (default: 3)
- `trailSizeDecay` (number): How quickly point size decreases for trail particles (default: 0.8)
- `ageThreshold` (number): Age threshold before particle position reset probability increases. This prevents particles from degenerating to some circular/looped pattern (default: 500)
- `maxAge` (number): Maximum age before particle position is forced to reset. This prevents particles from degenerating to some circular/looped pattern (default: 1000)
- `unit` (string): **(required)** When the source is a **GeoTIFF** file, the unit of the u- and v-component velocities stored in the bands. When the source is **EXIF JPEG**, the unit of the min/max velocity and speed values in the EXIF information. Must be consistent with the wind-speed units in the `color` parameter. Can be one of:
  - `'mph'` (default): Miles per hour
  - `'kph'`: Kilometers per hour
  - `'mps'`: Meters per second
- `velocityRange` (array): **Dataset-independent normalized JPEG/PNG only (required).** Two-element `[min, max]` in the layer `unit` option. Used to de-normalize u and v from the R and G bands when the JPEG/PNG source has no EXIF velocity metadata; applied to both u- and v- components. Ignored when valid EXIF metadata is present. Speed coloring without EXIF is inferred from `color` stops, not from this range. See [jpeg-source.md](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/docs/jpeg-source.md).
- `cacheOption` (string): [Cache option](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache) to use when fetching the source image. It can be one of no-cache (default), no-store, reload, default, or force-cache.
- `slot` (string): Optional [slot](https://docs.mapbox.com/style-spec/reference/slots/) identifier for the layer (used by Mapbox GL JS for [layer ordering](https://docs.mapbox.com/mapbox-gl-js/api/map/#addlayer-parameters-layer-slot)); typical values may include "top", "middle" (recommended), "bottom".
- `mapRuntime` (string): **(required for MapLibre)** `'mapbox'` (default) or `'maplibre'`. This parameter must be explicitly set to `'maplibre'` if maplibre-gl-js SDK is used. Only `'maplibre'` with [MapLibre GL JS](https://maplibre.org/projects/gl-js/) supports globe projection.
- `sourceType` (string): `'auto'` (default), `'jpeg'`, or `'geotiff'`. GeoTIFF requires optional peer package dependency [geotiff](https://www.npmjs.com/package/geotiff); see [geotiff-source.md](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/docs/geotiff-source.md).
- `uBand` (number): **GeoTIFF only.** GeoTIFF sample index for the u component (default: `0`, first band).
- `vBand` (number): **GeoTIFF only.** GeoTIFF sample index for the v component (default: `1`, second band).

#### Methods

- `setSource(source, percentParticleWhenSetSource = 0.5)` : Changes the source URL (JPEG or GeoTIFF), and optionally the proportion of particles whose positions must be reset when the source is updated (default half of the particles). The layer will repaint automatically.

### SmoothRaster

A custom raster layer for scalar fields (temperature, humidity, precipitation, etc.). 

With a **JPEG/PNG image** source, the grid is uploaded as an RGBA texture with linear filtering; the GPU bilinearly interpolates between adjacent texel values when sampling, producing a smooth, non-blocky gradient. See [docs/jpeg-source.md](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/docs/jpeg-source.md).

With a **GeoTIFF** source, a small single-band file (or one band from a multi-band file) is read directly in the browser and colormapped via the shader — useful when you want a GIS-friendly pipeline without custom image encoding, though the display tends to look blockier at native grid resolution than the image path. See [docs/geotiff-source.md](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/docs/geotiff-source.md).

#### Options

- `id` (string): **(required)** Unique layer ID
- `source` (string): **(required)** URL of an JPEG/PNG image or GeoTIFF file (`.tif` / `.tiff`; GeoTIFF requires optional peer package dependency `geotiff`)
- `color` (array): **(required)** Array of color stops `[value, [r, g, b]]`. Values do not have to be ordered since sorting is performed internally by the package. An optional A-band (opacity) value can also be specified, but interpolation will not be applied to A-band. A-band is useful for rendering precipitation by setting all zero or near-zero precipitation cells completely transparent (see [react-demo/real-time-example](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/react-demo/real-time-example/util.jsx)).
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

## Acknowledgement

The shader utility code of this package is referencing from util.js of [mapbox/webgl-wind](https://github.com/mapbox/webgl-wind/blob/master/src/util.js). The idea of EXIF is credit to [sakitam-fdd/wind-layer](https://github.com/sakitam-fdd/wind-layer).

## License

MIT 