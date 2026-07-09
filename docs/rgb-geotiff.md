# RGB / RGBA GeoTIFF

Display a true-color (RGB) or transparent (RGBA) GeoTIFF on a Mapbox GL JS or MapLibre GL JS map without a tile server. The file is fetched and decoded in the browser, then added as a native **`image` source** and **`raster` layer** via the `RgbGeoTiff` helper class.

This path is for **color imagery** (aerial photos, drone orthomosaics, georeferenced satellite tiles). It is **not** for scalar weather grids — those use PhotometricInterpretation **1** (grayscale) and belong on [`SmoothRaster`](../README.md#smoothraster) / [`ParticleMotion`](../README.md#particlemotion). See the decision table in [`geotiff-source.md`](geotiff-source.md#which-geotiff-do-you-have).

**Install the peer dependency:**

```bash
npm install geotiff
```

## Source data requirements

- **CRS:** EPSG:4326 (WGS 84). Reproject before use if needed:

```bash
gdalwarp -t_srs EPSG:4326 -overwrite input.tif output.tif
```

- **PhotometricInterpretation:** **2** (RGB). With 4 bands, the extra band is treated as alpha (RGBA).
- **Bit depth:** **uint8** or **uint16** per band. Sixteen-bit values are normalized to 8-bit for display.
- **Practical size limit:** `RgbGeoTiff` does **not** use the same `MAX_TEXTURE_SIZE` check as `SmoothRaster` / `ParticleMotion` (it never uploads the GeoTIFF to a custom WebGL texture). The file is decoded to a PNG in memory via `OffscreenCanvas`, so very large rasters can still fail or perform poorly due to browser memory and canvas limits — keep files reasonably small for client-side preview.

Verify with GDAL:

```bash
gdalinfo your_file.tif | grep ColorInterp
# Band 1 ... ColorInterp=Red
# Band 2 ... ColorInterp=Green
# Band 3 ... ColorInterp=Blue
# Band 4 ... ColorInterp=Alpha   (optional)
```

If bands show `ColorInterp=Gray`, the file is a **scalar** GeoTIFF — see [`geotiff-source.md`](geotiff-source.md).

## Usage

`RgbGeoTiff` is **not** a custom WebGL layer. Call `addTo(map)` after the map loads; call `remove()` when done (this also revokes the internal blob URL).

```javascript
import { RgbGeoTiff } from 'mapbox-exif-layer';

const rgbLayer = new RgbGeoTiff({
  id: 'aerial-photo',
  source: '/data/ortho.tif',
  opacity: 0.9
});

map.on('load', () => {
  rgbLayer.addTo(map);
});

// later:
rgbLayer.remove();
```

Geographic extent is read from the file — no `bounds` option is required.

### Constructor options

| Option | Default | Description |
|--------|---------|-------------|
| `id` | — | **(required)** Layer ID. Internal image source id is `${id}-rgb-source`. |
| `source` | — | **(required)** URL to the `.tif` / `.tiff` file. |
| `opacity` | `1.0` | Initial `raster-opacity` paint value. |
| `cacheOption` | `'no-cache'` | [Fetch cache](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache) when downloading the GeoTIFF. |
| `slot` | — | Mapbox GL JS v3 [slot](https://docs.mapbox.com/style-spec/reference/slots/) for layer ordering. |
| `beforeLayerId` | — | Insert the raster layer **below** this existing layer id (same as the second argument to `map.addLayer`). |

### Methods

- **`addTo(map)`** — Fetch, decode, add `image` source + `raster` layer. Returns `this`.
- **`remove()`** — Remove layer and source; revoke blob URL.

After `addTo`, the layer behaves like any other `raster` layer:

```javascript
map.setLayoutProperty('aerial-photo', 'visibility', 'none');
map.setPaintProperty('aerial-photo', 'raster-opacity', 0.5);
```

Full API reference: [README § RgbGeoTiff](../README.md#rgbgeotiff).

## Creating a georeferenced RGB GeoTIFF

If you already have a georeferenced JPEG/PNG and need a GeoTIFF for this workflow, `gdal_translate` can wrap it with EPSG:4326 bounds (example extent: west, south, east, north):

```bash
gdal_translate -a_srs EPSG:4326 \
  -a_ullr -122.5 37.9 -122.3 37.7 \
  photo.jpg photo.tif
```

For production orthomosaics from photogrammetry tools (Agisoft, Pix4D, etc.), export as **GeoTIFF, EPSG:4326, RGB or RGBA, uint8 or uint16**.

## Notes

- **Full file download:** Like scalar GeoTIFF, the entire file is fetched into the browser on load (no COG range requests). Best for **small** regional mosaics or quick previews. For large imagery at many zoom levels, use a raster tile service instead.
- **Not float32 radiometry:** Float32 RGB GeoTIFFs are not supported. Use uint8/uint16 display-ready imagery.
- **Demo:** Plain HTML example — [`maplibre-gl-demo/rgba-geotif-demo`](../maplibre-gl-demo/rgba-geotif-demo/).
