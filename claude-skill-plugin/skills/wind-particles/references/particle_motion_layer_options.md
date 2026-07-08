# ParticleMotion layer options

Optional constructor parameters for fine-tuning wind particle behavior and appearance.

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
- `sourceType` (string): `'auto'` (default), `'jpeg'`, or `'geotiff'`. GeoTIFF requires optional peer package dependency [`geotiff`](https://www.npmjs.com/package/geotiff); see [geotiff-source.md](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/docs/geotiff-source.md).
- `uBand` (number): **GeoTIFF only.** GeoTIFF sample index for the u component (default: `0`, first band).
- `vBand` (number): **GeoTIFF only.** GeoTIFF sample index for the v component (default: `1`, second band).


Available method

- `setSource(source, percentParticleWhenSetSource = 0.5)` : Changes the source URL (JPEG/PNG or GeoTIFF), and optionally the proportion of particles whose positions must be reset when the source is updated (default half of the particles). The layer will repaint automatically.
