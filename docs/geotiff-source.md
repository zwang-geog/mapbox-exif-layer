# GeoTIFF source (float32, EPSG:4326)

GeoTIFF is an optional source format alongside EXIF JPEG since v1.3.0+. It fits workflows that are already familiar in the GIS community: after a standard `gdalwarp` / `gdal_translate` step, float32 rasters in EPSG:4326 can be used **without** re-scaling or normalizing values into 8-bit JPEG bands — physical cell values go straight to the GPU, so you keep **higher precision** than the EXIF JPEG pipeline. The trade-off is **larger files** to store and transfer (uncompressed float32 is much bigger than JPEG), and the constraints in [Notes](#notes) below (texture size limits, nearest sampling / blocky `SmoothRaster` appearance, full-file browser download). 

**Install the peer dependency when using GeoTIFF:**

```bash
npm install geotiff
```

## Source data requirements

- **CRS:** EPSG:4326 (WGS 84). Reproject and convert to GeoTIFF with tools such as [gdalwarp](https://gdal.org/en/stable/programs/gdalwarp.html) before use.

```bash
gdalwarp -t_srs EPSG:4326 -dstnodata -9999 -ot Float32 -overwrite \
  -te -125 24 -65 50 \
  -b 1 -b 2 \
  input.grib2 output.tif
```

Useful flags in above example:

| Flag | Purpose |
|------|---------|
| `-t_srs EPSG:4326` | Reproject to WGS 84 (required by this package) |
| `-dstnodata` *value* | Standardize the output no-data value (e.g. `-dstnodata -9999`). Not required to be `-9999`; use any sentinel your pipeline agrees on. Recommended so the written GeoTIFF has one consistent no-data value even when the source uses something else |
| `-ot Float32` | Output sample type. This package assumes float32 on the GPU; other types (e.g. `Float64`) are converted, which can lose precision |
| `-te xmin ymin xmax ymax` | Optional crop to a geographic extent (west, south, east, north in degrees once reprojected). Omit if the full input raster should be rendered |
| `-b` | When the input has more bands than needed, subset with `-b` to keep the output file as small as possible. GDAL band indices are **1-based**. |
| `-overwrite` | Replace `output.tif` if it already exists; omit this flag to fail when the output path is taken |

See the [gdalwarp documentation](https://gdal.org/en/stable/programs/gdalwarp.html) for resampling (`-r`), output resolution (`-tr`, `-outsize`), and other options. GeoTIFF output is **uncompressed by default**; add `-co COMPRESS=ZSTD` if you need a smaller file (`LZW`, `DEFLATE`, and other codecs are also supported).

**gdalwarp** vs [gdal_translate](https://gdal.org/en/stable/programs/gdal_translate.html): `gdalwarp` **resamples and reprojects** — it rebuilds the pixel grid for a new CRS, extent, or resolution. Use it for GRIB2→GeoTIFF, any input not already in EPSG:4326, geographic cropping with `-te`, or whenever pixel values must be warped. [gdal_translate](https://gdal.org/en/stable/programs/gdal_translate.html) **copies bands without resampling** — same georeferencing and grid (unless you subset by pixel window). Use it when the raster is already EPSG:4326 and you only need to change sample type (`-ot`), subset bands (`-b`), set no-data (`-dstnodata`), add compression (`-co`), or extract a subwindow (`-srcwin`). `-a_srs` on `gdal_translate` writes CRS metadata only; it does **not** reproject pixels — use `gdalwarp` for that.

*Optionally compress after gdalwarp (often better than -co on the warp step itself):*
```bash
gdal_translate warped.tif warped_zstd.tif -co COMPRESS=ZSTD
# LZW alternative: gdal_translate warped.tif warped_lzw.tif -co COMPRESS=LZW
```

## Band layout

When using this package with GeoTIFF, you have the flexibility to define which bands from the file to render. Set `scalarBand` on `SmoothRaster` or `uBand` / `vBand` on `ParticleMotion` to point at the sample indices you need (e.g. when wind U- and V-velocities are not the first two bands, or when a multi-band file holds several variables).

Band indices in this package are **0-based** sample indices (same as `geotiff` `readRasters` `samples`).

| Layer | Option(s) | Default |
|-------|-----------|---------|
| `SmoothRaster` | `scalarBand` | `0` (first band) |
| `ParticleMotion` | `uBand`, `vBand` | `0`, `1` |

Wind u- and v- velocities cell values should use the same unit as the layer `unit` option (`mph`, `kph`, or `mps`).

## Example constructors

```javascript
new ParticleMotion({
  source: '/data/wind.tif', // The package automatically detects sourceType by checking file extension with .tif or .tiff
  uBand: 0,  // wind u-component velocity reads from the first band by default; only have to modify uBand if the data stores u-component velocity not in the first band
  vBand: 1, // wind v-component velocity reads from the second band by default; only have to modify vBand if the data stores v-component velocity not in the second band
  // Other common layer settings at layer initialization
  id: 'wind-particle',
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
        [42, [128, 0, 0]]],   // [ [Wind speed, [R, G, B]] ...]
  // bounds parameter is not mandatory for GeoTIFF data source since it is retrieved from the file directly, but can still be specified so that in the future the source can be correctly updated to a EXIF-enabled JPEG source via setSource method
  unit: "mph",  // The unit corresponding to the wind velocity stored in the uBand and vBand, and also the wind speed unit in color parameter
  mapRuntime: 'maplibre',  // The default runtime is mapbox, this example sets the runtime to maplibre,
  readyForDisplay: true  // Only set this parameter to true if you want this layer to show up when the map is initially loaded. Otherwise (you have many layers but this layer is not to be shown up without toggeling), you do not need to specify this parameter
});

const tempLayer = new SmoothRaster({
  source: '/data/temperature.tif', // The package automatically detects sourceType by checking file extension with .tif or .tiff
  scalarBand: 0, // temperature value reads from the first band by default; if the desired values are stored in a different band, setting this parameter accordingly
  id: 'temperature',
  color: TEMPERATURE_COLOR,
  opacity: 0.6,
  // bounds parameter is not mandatory for GeoTIFF data source since it is retrieved from the file directly, but can still be specified so that in the future the source can be correctly updated to a EXIF-enabled JPEG source via setSource method
  mapRuntime: 'maplibre',  // The default runtime is mapbox, this example sets the runtime to maplibre,
  readyForDisplay: true  // Only set this parameter to true if you want this layer to show up when the map is initially loaded. Otherwise (you have many layers but this layer is not to be shown up without toggeling), you do not need to specify this parameter
});
```

## Notes

- **Texture size limit:** The raster is uploaded as **one 2D GPU texture** (`width` × `height`). WebGL limits each side independently: both width and height must be ≤ `gl.MAX_TEXTURE_SIZE` (often 4096 or 8192 on desktop GPUs). This is **a cap on the grid dimension** but not on the cell number. The package throws if either side is too large. However, typical native grids in weather forecast usually have both sides within a 4096 limit, so throw situation should be uncommon:
  - **GFS 0.25° global:** 1440 × 721
  - **NAM NEST CONUS:** 2269 × 976
- **Smoothness vs JPEG (`SmoothRaster`):** With EXIF JPEG, the source is an 8-bit RGBA texture sampled with **linear** filtering, so the GPU blends between neighboring cells and the layer looks smooth when zoomed in. GeoTIFF scalar data is uploaded as a **float32** (`R32F`) texture and sampled with **nearest** filtering — WebGL does not reliably support linear filtering on float textures, so each fragment reads one grid cell with no value blending. MapLibre globe **mesh** subdivision (typically on the order of tens–128 segments across the layer bounds) only smooths how the quad is draped on the globe; it does **not** interpolate physical values between raster cells the way JPEG linear sampling does. Expect GeoTIFF `SmoothRaster` to look **blockier**, especially at native model resolution (e.g. NAM 2269×976), with visible cell edges when zoomed in. `ParticleMotion` is less affected visually because particles advect continuously, but velocity lookups still use nearest sampling on the float texture. Nearest sampling does **not** shift cell locations — each texel still maps to one model grid cell over its share of the GeoTIFF bounding box (EPSG:4326), so boundaries fall on the same lng/lat grid lines as the source file. That is similar to a **classic GIS view at native resolution with nearest-neighbor resampling** (e.g. QGIS zoomed to 100%): blocky, but **grid-aligned and cell-faithful**.
- **Full file browser download:** The layer **fetches the entire GeoTIFF** into the browser on load (no COG range requests or tiling). That keeps setup simple and works well for **`ParticleMotion` wind** and a **quick preview** of a scalar raster at regional or national scale (e.g. a single forecast timestep). For **large GeoTIFFs**, production maps at many zoom levels, or repeated pan/zoom over huge extents, serve **pre-generated raster tiles** instead — e.g. build MBTiles from the raster and run a tile server such as [mbtileserver](https://github.com/consbio/mbtileserver), or use TiTiler / GeoServer / similar — and add a standard Mapbox/MapLibre **raster tile source** rather than loading the full file through this package.