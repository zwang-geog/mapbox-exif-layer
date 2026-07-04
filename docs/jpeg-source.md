# EXIF JPEG source

EXIF-enabled JPEG is the default source format for both `SmoothRaster` and `ParticleMotion`. Grid values are normalized to integers **0–255** and stored in the image RGB bands (8 bits per band); min/max metadata before normalization is stored in EXIF `ImageDescription` — that is where the name of this package comes from. This approach is inspired by [wind-layer](https://github.com/sakitam-fdd/wind-layer/tree/master/packages/mapbox-gl); storing normalized grid values in an image goes back to Vladimir Agafonkin's [wind map article](https://blog.mapbox.com/how-i-built-a-wind-map-with-webgl-b63022b5537f).

## Important update — breaking change (>= v1.1.0)

**Package version ≥ 1.1.0 is required** to correctly display raster data that contains NA/missing cells. Releases **1.0.3 and below** do not read the B band and will not mask NA values, which can produce incorrect colors or stray wind particles.

**Use the latest `pipeline/grib2_to_image.py` in this repo (updated after 6/27/2026)** when preparing JPEG sources. Older pipeline scripts do not encode the B-band NA mask.

Starting with v1.1.0, the **B band** marks whether a cell is NA:

| Layer | R band | G band | B band (NA encoding) |
|-------|--------|--------|----------------------|
| Smooth raster (e.g. temperature, relative humidity, precipitation) | normalized attribute value | 0 | **255** = NA, **0** = valid |
| Wind particles | normalized U velocity | normalized V velocity | **0** = NA, **255** = valid |

The encoding is intentionally reversed between the two layer types so that legacy single-band images (B always 0) remain compatible with smooth raster layers.

## Source data requirements

To use this package for displaying smooth raster or particle motion layers, first **reproject the raw raster data into WGS 1984 (EPSG:4326)**.

### Smooth raster

The band of the attribute to map needs to have its values normalized to an integer between 0–255 and stored as the **R band** of a JPEG image. The min and max of the values (without normalization) are required so the package can de-normalize pixel values to actual values; store them in EXIF **ImageDescription** in the format:

```text
min-attribute-value,max-attribute-value;
```

For smooth raster layers, NA values should be encoded as **255** in the B band while non-NA values should be encoded as **0** (see table above).

#### Smooth raster without EXIF (JPEG or PNG)

`SmoothRaster` can also load a normalized scalar image that has **no** EXIF metadata. On load, EXIF is tried first; only when scalar metadata is missing does the layer use the constructor option `scalarValueRange`.

- **`scalarValueRange`** (array): Two-element `[min, max]` matching the physical range used when encoding values into the R band (0–255).

Example:

```javascript
new SmoothRaster({
  id: 'temperature',
  source: 'path/to/temperature.png',
  bounds: [-121, 36, -117, 32],
  scalarValueRange: [-20, 45],
  color: [
    [-20, [0, 0, 255]],
    [0, [255, 255, 255]],
    [45, [255, 0, 0]],
  ],
});
```

If the image includes valid EXIF scalar metadata, EXIF values take precedence and `scalarValueRange` is ignored for that source.

### Wind particles

The u- and v-component velocity need to be in a consistent unit (mph by default; m/s or km/h via the layer `unit` option — see README Usage Reminder), normalized to integers between 0–255, and stored as **R** and **G** bands of a JPEG image, respectively. For NA cells, encode **0** in the B band; for non-NA cells, encode **255**.

Additionally, write the min and max of u- and v-component velocity (without normalization) and the min and max of speed (sqrt(u² + v²)) to EXIF ImageDescription in the format:

```text
min-u-velocity,max-u-velocity;min-v-velocity,max-v-velocity;min-speed,max-speed;
```

### Wind particles without EXIF (JPEG or PNG)

`ParticleMotion` can also load a normalized u/v image that has **no** EXIF metadata (for example output from `pipeline/grib2_uv_to_image_with_fix_min_max.py`, which uses one fixed min/max for both components). On load, EXIF is tried first; only when velocity metadata is missing does the layer use the constructor option `velocityRange`.

- **`velocityRange`** (array): Two-element `[min, max]` in the layer `unit` option. Applied to **both** u and v when denormalizing R/G bands from 0–255 back to physical velocity.
- **Speed coloring**: When EXIF does not provide min/max speed, the colormap range is inferred from the `color` stops (same behavior as GeoTIFF sources).

Example:

```javascript
new ParticleMotion({
  id: 'wind-particle',
  source: 'path/to/wind.png',
  bounds: [-121, 36, -117, 32],
  velocityRange: [-64, 64],  // must match fixed min/max used when encoding the image
  unit: 'mps',
  color: [
    [0, [50, 0, 0]],
    [10, [255, 255, 0]],
    [20, [0, 255, 0]],
  ],
});
```

If the image includes valid EXIF wind metadata, EXIF values take precedence and `velocityRange` is ignored for that source.

## GRIB2 → JPEG pipeline example

Under the `pipeline/` folder of this repo, there is a Python script with associated sample JSON files (based on NOAA HIRESW forecast) for converting GRIB2 to EXIF-enabled JPEG images. Example: fetch NOAA HIRESW wind for southern California and encode as JPEG ([more public data](https://nomads.ncep.noaa.gov/)):

```bash
DATE=$(date -u +%Y%m%d)
HOUR=01  # 00..48
GRIB_FILE="wind_01.grib2"
REPROJECTED_GRIB="reprojected_01.grib2"
curl -f -s -o "$GRIB_FILE" "https://nomads.ncep.noaa.gov/cgi-bin/filter_hiresconus.pl?dir=%2Fhiresw.${DATE}&file=hiresw.t00z.arw_5km.f${HOUR}.conus.grib2&var_UGRD=on&var_VGRD=on&lev_10_m_above_ground=on&subregion=&toplat=36&leftlon=239&rightlon=243&bottomlat=32"
gdalwarp -t_srs EPSG:4326 -dstnodata -9999 -overwrite -te -121 32 -117 36 "$GRIB_FILE" "$REPROJECTED_GRIB"
python grib2_to_image.py "$REPROJECTED_GRIB" "${HOUR}" "jpeg_wind.json" "jpeg"  # A text file containing bounds info will also be outputed

# aws s3 cp "$TEMP_DIR/wind/" s3://{AWS_S3_BUCKET_PATH}/wind-images/ --recursive --exclude "*" --include "*.jpeg"
```

For images **without** EXIF (fixed-range u/v encoding), use `pipeline/grib2_uv_to_image_with_fix_min_max.py` and pass matching `velocityRange` on `ParticleMotion` — see [Wind particles without EXIF](#wind-particles-without-exif-jpeg-or-png) above.
