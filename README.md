# Mapbox EXIF Layer

[![npm version](https://img.shields.io/npm/v/mapbox-exif-layer)](https://www.npmjs.com/package/mapbox-exif-layer)

Custom Mapbox GL JS / MapLibre GL JS layers for rendering particle motion (e.g., wind) or smooth raster (e.g., temperature, relative humidity, precipitation) from EXIF-enabled JPEG images or GeoTIFF files


> **GeoTIFF support.** Despite the package name, `ParticleMotion` and `SmoothRaster` accept GeoTIFF sources (float32, EPSG:4326) in addition to EXIF-enabled JPEG (v1.3.1+). GeoTIFF rasters use physical cell values directly and do not require 0–255 normalization. See [`docs/geotiff-source.md`](docs/geotiff-source.md). JPEG source requirements are documented in [`docs/jpeg-source.md`](docs/jpeg-source.md).

Official site: [https://www.mapbox-exif-layer.com/](https://www.mapbox-exif-layer.com/)

**Feature Highlights**
* A built-in [custom layer](https://docs.mapbox.com/mapbox-gl-js/api/properties/#customlayerinterface) (Mapbox GL JS or MapLibre GL JS) instead of a canvas overlay, so layers are natively integrated with the map
* **New in v1.2.0+: MapLibre GL JS with globe projection** — set `mapRuntime: 'maplibre'` on `ParticleMotion` or `SmoothRaster` and use MapLibre's [globe projection](https://maplibre.org/maplibre-gl-js/docs/examples/add-a-simple-custom-layer-on-a-globe/) (`map.setProjection({ type: 'globe' })`); see [`maplibre-gl-demo`](maplibre-gl-demo/maplibre-gl-demo/src/App.jsx) for a working example. Mapbox GL JS remains as the default mapRuntime and only supports mercator.
* No tile server setup required: a GeoTIFF file or an EXIF-enabled JPEG image as source (as simple as uploading the file to a publicly accessible AWS S3 bucket)
* **WebGL GPU-accelerated** wind particles: position and age live in GPU buffers, each frame a dedicated vertex shader advances every particle via transform feedback — no per-frame CPU loop over hundreds of thousands of points
* Works for browsers on both desktop/laptop and iPhone/iPad
* Wind particles can have varying colors based on speed, and particle movement respect the relative u- and v-component velocity rather than moving at the same rate
* Well-suited for displaying local, regional, or national weather forecast results
* Method for updating the source url is available, so setting forecast for different timestamps can be done easily

[US wind & temperature demo (source: react-demo/react-demo)](https://www.us-wind-particle-map-demo.mapbox-exif-layer.com)

[Weather map time slider demo (source: react-demo/real-time-example)](https://www.weather-map-time-slider-demo.mapbox-exif-layer.com)

[Maplibre GL JS globe projection demo (source: maplibre-gl-demo/maplibre-gl-demo)](https://www.mapbox-exif-layer.com/maplibre-gl-js-globe-projection-demo/index.html)

[Demo video — Southern California wind particles (earlier demo)](https://www.youtube.com/watch?v=HLu0Ylhu5x4)

[Demo video — US continental wind particle animation (v1.1.0)](https://www.youtube.com/watch?v=Zo6MDJT718Y)

[Demo video - Maplibre GL JS globe projection](https://www.youtube.com/watch?v=mYro7l2piB0)

[Technique Explanation](https://medium.com/@zifanw9/a-low-cost-custom-wind-particle-motion-layer-in-mapbox-gl-js-9a51978e3ffb)

## Background and Data Requirement

**Smooth raster layer** (a.k.a. sample fill in [windgl](https://github.com/astrosat/windgl/tree/master), colorize in [wind-layer](https://blog.sakitam.com/wind-layer/playgrounds/mapbox-gl/colorize.html)) is just a different way to render the classic raster data on the web browser. The raw raster data consist of a grid of cells with each cell has one or more bands storing some kind of values (e.g., temperature), and a cell has a size (1/4 degrees, 5 km, 500 m, etc) making it looks like a box. The conventional way to render such data on the web is to generate a set of images by assigning colors to each cell and serving those images via a tile server; the eventual result is blocky, coarse cells appearing as a layer, just like what you typically see on a desktop GIS software like QGIS. For certain data such as weather data, we would expect strong spatial autocorrelation, and a smooth display of such data will be desired. With WebGL's varyings and fragment shader, automatic linear interpolation of colors across the space on clientside is possible (see [WebGL fundamentals](https://webglfundamentals.org/webgl/lessons/webgl-fundamentals.html)), and we do not need to worry about doing interpolation or down-scaling of the raster data ourselves to make the layer looks smooth for web visualization.

**Particle motion layer** is the companion approach for **vector fields** such as wind, where each grid cell stores u- and v-component velocity rather than a single scalar. A conventional web map might show wind with static arrows. A particle layer instead releases hundreds of thousands of short-lived points (with tails) into the field; each frame, every particle samples the local u/v at its position, moves a small step in that direction, and is recolored by speed at the new position. The effect is a continuous, flowing animation that makes direction and relative speed easy to read at a glance. This package runs that update on the GPU (transform feedback and a dedicated update vertex shader) rather than moving particles on the CPU each frame, and integrates the result as a Mapbox/MapLibre custom layer so pan and zoom stay in sync with the basemap or any other overlaid layers.

Sources can be either **EXIF-enabled JPEG** (default) or optional **GeoTIFF**. See [`docs/jpeg-source.md`](docs/jpeg-source.md) for JPEG band encoding, EXIF metadata, B-band NA masking (v1.1.0+), and the GRIB2 pipeline example. See [`docs/geotiff-source.md`](docs/geotiff-source.md) for float32 GeoTIFF (EPSG:4326).

**Map Projection Reminder**
The use of **Mapbox GL JS:** requires setting projection to `'mercator'` when initializing the map — the default `mapRuntime: 'mapbox'` does not support globe. The use of **MapLibre GL JS:** requires setting `mapRuntime: 'maplibre'` on each layer - MapLibre's globe projection is supported in v1.2.0+ (see [`maplibre-gl-demo`](maplibre-gl-demo/maplibre-gl-demo/src/App.jsx)).

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
import { ParticleMotion, SmoothRaster } from 'mapbox-exif-layer';
```

## Usage

```javascript
// Initialize a map
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/dark-v11',
  zoom: 7,
  center: [-119.699944,34.432546],
  projection: 'mercator'  // For mapbox-gl-js only: projection must always be explicitly set to mercator (not globe which is the default for many mapbox styles)
});

// Defining particle motion layer for wind
const particleLayer = new ParticleMotion({
  id: 'wind-particle',
  source: 'path/to/your/exif/image.jpeg',    // Alternatively, source can be a GeoTIFF file with .tif or .tiff file extension
  color: [[0, [0, 195, 255]],
          [2, [0, 228, 248]],
          [4, [26, 255, 221]],
          [6, [53, 255, 194]],
          [8, [80, 255, 167]],
          [10, [109, 255, 138]],
          [12, [137, 255, 110]],
          [14, [165, 255, 82]],
          [16, [193, 255, 54]],
          [18, [219, 255, 27]],
          [20, [249, 243, 1]],
          [22, [255, 212, 0]],
          [24, [255, 182, 0]],
          [26, [255, 151, 0]],
          [28, [255, 120, 0]],
          [30, [255, 89, 0]],
          [32, [255, 55, 0]],
          [34, [255, 21, 0]],
          [36, [220, 0, 0]],
          [38, [182, 0, 0]],
          [40, [144, 0, 0]],
          [42, [128, 0, 0]]],   // [ [Wind speed in the same unit as input source data, [R, G, B]] ...]
  unit: 'mph',  // When GeoTIFF file is the source, this is the unit of the u- and v-component velocities stored in the bands; when EXIF-JPEG is the source, this is the unit of the min and max velocity/speed values in the EXIF information. The unit should be consistent with the color parameter above as well
  bounds: [-121, 36, -117, 32],    // [minX, maxY, maxX, minY] ; this parameter is mandatory for EXIF-JPEG source, but optional for GeoTIFF source (GeoTIFF source will always uses bounds stored in the file)
  readyForDisplay: true  // Only set this parameter to true if you want this layer to show up when the map is initially loaded. Otherwise (you have many layers but this layer is not to be shown up without toggeling), you do not need to specify this parameter
});

// Defining smooth raster layer for relative humidity 
const relativeHumidityLayer = new SmoothRaster({
  id: 'relative-humidity',
  source: 'path/to/your/exif/image.jpeg',   // Alternatively, source can be a GeoTIFF file with .tif or .tiff file extension
  color: [  [5, [149, 89, 16]],    // value less than 5 will have the same color as a pixel with value 5
            [10, [169, 107, 30]],
            [15, [190, 128, 45]],
            [20, [203, 154, 75]],
            [25, [215, 181, 109]],
            [30, [227, 202, 138]],
            [35, [238, 216, 166]],
            [40, [246, 232, 195]],
            [45, [245, 237, 214]],
            [50, [245, 242, 235]],
            [55, [237, 243, 243]],
            [60, [217, 237, 235]],
            [65, [197, 233, 229]],
            [70, [171, 222, 215]],
            [75, [140, 210, 200]],
            [80, [113, 195, 183]],
            [85, [81, 171, 162]],  
            [90, [52, 149, 142]],
            [95, [30, 130, 122]],
            [100, [10, 111, 103]]
          ],
  bounds: [-121, 36, -117, 32],
  readyForDisplay: true,
  opacity: 0.6
});

// Defining smooth raster layer for hourly precipitation amount
const precipitationLayer = new SmoothRaster({
  id: 'precipitation',
  source: 'path/to/your/exif/image.jpeg',
  color: [ [0.249999, [4, 232, 231, 0]],  // this line ensures any pixel with precipitation less than 0.25 will be shown as transparent
            [0.25, [4, 232, 231]],
            [1, [4, 159, 243]],
            [2, [4, 0, 243]],
            [4, [2, 253, 2]],
            [6, [1, 197, 1]],
            [8, [0, 141, 0]],
            [10, [253, 247, 1]],
            [12, [229, 188, 0]],
            [14, [253, 149, 0]],
            [15, [253, 1, 0]],
            [20, [212, 0, 0]],
            [30, [188, 0, 0]],
            [40, [247, 0, 254]],
            [50, [152, 83, 199]] 
          ],   // Note that the value intervals do not have to be the same/constant (1-2 vs 2-4 vs 15-20)
  bounds: [-121, 36, -117, 32],
  opacity: 0.6
  // Note that I did not add readyForDisplay: true to this layer so it will not be rendered when map is loaded initially
});

map.on('load', () => {
  // Add the custom layers like what you typically will do for other layers
  // If readyForDisplay is not set to true, the custom layers in this package will not render until you set it to true
  map.addLayer(relativeHumidityLayer, 'road-label-simple');
  map.addLayer(precipitationLayer, 'road-label-simple');
  map.addLayer(particleLayer, 'road-label-simple');  // the second argument 'road-label-simple' is a layer name in Mapbox style dark-v11, and it is optional. I specify this parameter to ensure the custom layer will be below all the map labels; other Mapbox styles do not necessarily have a layer with name 'road-label-simple'
});
```

If you would like to make the layer appear on the map sometimes after initial map load (e.g., an user clicks a button to try to turn on the layer), you can directly modify the object's corresponding property
```javascript
precipitationLayer.readyForDisplay = true;
```

It is possible to control the custom layers' visibility via map's conventional setLayoutProperty method like you will do when working with other layers, but readyForDisplay property always needs to be true for the layer to be visible. readyForDisplay property is just a mechanism to prevent rendering when the layer is initially added to the map, and once it is set to true we should use setLayoutProperty method of map object to control its visibility.
```javascript
map.setLayoutProperty('precipitation','visibility','none');
map.setLayoutProperty('precipitation','visibility','visible');
```

For both smooth raster and particle motion layers, you can change their sources to match a different timestamp, and the layers will update automatically:
```javascript
precipitationLayer.setSource("url/to/a/different/precipitation/img.jpeg");
particleLayer.setSource("url/to/a/different/wind/img.jpeg");
```

For the smooth raster layer, there is an optional second argument for color, which enables simultaneous updates on both source url and color schema. This optional argument is useful when you have only one smooth raster layer added to the map, but the content of the layer can be any of temperature, relatively humidity, or precipitation, in which each has its own color schema; in such a case, both color schema and source url will need to be updated.
```javascript
precipitationLayer.setSource("url/to/a/different/relativehumidity/img.jpeg", relativeHumidityColorArray);
```

For the particle motion layer, there is also an optional second argument specifying the proportion of particles whose positions must be randomly reset when the source is changed (default 0.5). This argument aims to reduce the new source particle initial positions' dependency on the previous state.
```javascript
particleLayer.setSource("url/to/a/different/wind/img.jpeg", 0.7);
```

With **MapLibre GL JS**, set `mapRuntime: 'maplibre'` on each layer (required for globe projection in v1.2.0+):
```javascript
import maplibregl from 'maplibre-gl';
import { ParticleMotion, SmoothRaster } from 'mapbox-exif-layer';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/dark',
  zoom: 7,
  center: [-119.699944, 34.432546]
});

const particleLayer = new ParticleMotion({
  id: 'wind-particle',
  source: 'path/to/wind.tif',
  color: WIND_COLOR,
  // bounds parameter is not mandatory when you expect source is always tif
  mapRuntime: 'maplibre',
  readyForDisplay: true
});

map.on('load', () => {
  map.addLayer(particleLayer);
});

map.on('style.load', () => {
  map.setProjection({ type: 'globe' });
});
```

**Aside**

Although the color parameter defines an array of discrete value-RGB mappings, the package will always interpolate based on the given mappings and the min/max info in EXIF to create a texture with a total of 256 discrete color steps, and the final effect will be a color schema that seems to be continuous. If you want to color the raster in a complete discrete manner, this package will not be suitable. A continuous color schema is important in helping smooth raster layer look smooth.

**Note:** That smooth **visual** effect applies mainly to the **EXIF JPEG** path, where the source texture uses linear filtering between neighboring cells. With a **GeoTIFF** source, `SmoothRaster` uploads float32 data and samples with nearest filtering, so the layer tends to look **blockier** at native grid resolution even though colormap stops are still interpolated. See [`docs/geotiff-source.md`](docs/geotiff-source.md) (Smoothness vs JPEG).

## Available Class Reference

### ParticleMotion

A particle-based visualization layer that creates animated particles, suitable for wind direction and speed visualization

#### Options

- `id` (string): Unique layer ID
- `source` (string): URL of an EXIF-enabled JPEG image or GeoTIFF file (`.tif` / `.tiff`; GeoTIFF requires optional peer package dependency`geotiff`)
- `color` (array): Array of color stops `[value, [r, g, b]]`. Values do not have to be ordered since sorting is performed internally by the package.
- `bounds` (array): Extent as `[minX, maxY, maxX, minY]` (longitude −180…180, latitude −90…90). **Required for EXIF JPEG** (extent is not stored in the image). **Optional for GeoTIFF** — bounds are read from the file; supply `bounds` only if you may later call `setSource` with a JPEG URL that leads to a different extent.
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
- `unit` (string): When the source is a **GeoTIFF** file, the unit of the u- and v-component velocities stored in the bands. When the source is **EXIF JPEG**, the unit of the min/max velocity and speed values in the EXIF information. Must be consistent with the wind-speed units in the `color` parameter. Can be one of:
  - `'mph'` (default): Miles per hour
  - `'kph'`: Kilometers per hour
  - `'mps'`: Meters per second
- `cacheOption` (string): [Cache option](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache) to use when fetching the source image. It can be one of no-cache (default in 1.0.3), no-store (default in 1.0.2), reload, default, or force-cache.
- `slot` (string): Optional [slot](https://docs.mapbox.com/style-spec/reference/slots/) identifier for the layer (used by Mapbox GL JS for [layer ordering](https://docs.mapbox.com/mapbox-gl-js/api/map/#addlayer-parameters-layer-slot)); typical values may include "top", "middle" (recommended), "bottom".
- `mapRuntime` (string): `'mapbox'` (default) or `'maplibre'`. This parameter must be explicitly set to `'maplibre'` if maplibre-gl-js SDK is used. Only `'maplibre'` with [MapLibre GL JS](https://maplibre.org/projects/gl-js/) supports globe projection.
- `sourceType` (string): `'auto'` (default), `'jpeg'`, or `'geotiff'`. GeoTIFF requires optional peer package dependency [`geotiff`](https://www.npmjs.com/package/geotiff); see [`docs/geotiff-source.md`](docs/geotiff-source.md).
- `uBand` (number): GeoTIFF sample index for the u component (default: `0`, first band).
- `vBand` (number): GeoTIFF sample index for the v component (default: `1`, second band).

#### Methods

- `setSource(source, percentParticleWhenSetSource = 0.5)` : Changes the source URL (JPEG or GeoTIFF), and optionally the proportion of particles whose positions must be reset when the source is updated (default half of the particles). The layer will repaint automatically.

### SmoothRaster

A raster visualization layer that provides a smooth display of the data.

#### Options

- `id` (string): Unique layer ID
- `source` (string): URL of an EXIF-enabled JPEG image or GeoTIFF file (`.tif` / `.tiff`; GeoTIFF requires optional peer package dependency `geotiff`)
- `color` (array): Array of color stops `[value, [r, g, b]]`. Values do not have to be ordered since sorting is performed internally by the package. An optional A-band (opacity) value can also be specified, but interpolation will not be applied to A-band. A-band is useful for rendering precipitation by setting all zero or near-zero precipitation cells completely transparent (see Usage example).
- `bounds` (array): Extent as `[minX, maxY, maxX, minY]` (longitude −180…180, latitude −90…90). **Required for EXIF JPEG** (extent is not stored in the image). **Optional for GeoTIFF** — bounds are read from the file; supply `bounds` only if you may later call `setSource` with a JPEG URL that leads to a different extent.
- `opacity` (number): Layer global opacity (default: 1.0)
- `readyForDisplay` (bool): Preventing the layer from rendering when the layer is added to the map, if necessary (default: false)
- `cacheOption` (string): [Cache option](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache) to use when fetching the source image. It can be one of no-cache (default in 1.0.3), no-store (default in 1.0.2), reload, default, or force-cache.
- `slot` (string): Optional [slot](https://docs.mapbox.com/style-spec/reference/slots/) identifier for the layer (used by Mapbox GL JS for [layer ordering](https://docs.mapbox.com/mapbox-gl-js/api/map/#addlayer-parameters-layer-slot)); typical values may include "top", "middle" (recommended), "bottom".
- `mapRuntime` (string): `'mapbox'` (default) or `'maplibre'`. This parameter must be explicitly set to `'maplibre'` if maplibre-gl-js SDK is used. Only `'maplibre'` with [MapLibre GL JS](https://maplibre.org/projects/gl-js/) supports globe projection.
- `sourceType` (string): `'auto'` (default), `'jpeg'`, or `'geotiff'`. GeoTIFF requires optional peer package dependency [`geotiff`](https://www.npmjs.com/package/geotiff); see [`docs/geotiff-source.md`](docs/geotiff-source.md).
- `scalarBand` (number): GeoTIFF sample index for scalar data (default: `0`, first band).

#### Methods

- `setSource(source, color=null)` : Changes the source URL (JPEG or GeoTIFF), and optionally color array (default is to use the same color array as before). The layer will repaint automatically.

## Acknowledgement

The shader utility code of this package is referencing from util.js of [mapbox/webgl-wind](https://github.com/mapbox/webgl-wind/blob/master/src/util.js). The idea of EXIF is credit to [sakitam-fdd/wind-layer](https://github.com/sakitam-fdd/wind-layer).

## License

MIT 