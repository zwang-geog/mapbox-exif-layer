# ParticleMotion layer options

Optional constructor parameters for fine-tuning wind particle behavior and appearance.

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


Available method

- `setSource(source, percentParticleWhenSetSource = 0.5)` : Changes the source URL (JPEG/PNG or GeoTIFF), and optionally the proportion of particles whose positions must be reset when the source is updated (default half of the particles). The layer will repaint automatically.
