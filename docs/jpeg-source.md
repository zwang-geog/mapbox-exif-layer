# JPEG/PNG source

## Image band value encoding overview

A JPEG or PNG image stores three 8-bit RGB bands (integers 0-255 per band/channel). 

Wind u- and v-component velocities, temperature, relative humidity, hourly precipitation, and many other weather raster data are in a continuous scale instead of discrete integers. **Storing those continuous variables in a JPEG image requires re-scaling and normalizing the values**. On the negative side, such a re-scaling and normalizing process will lead to loss in precision (floats can store a wide range of possible values at many decimal places precision, while uint8 can only store up to 256 possible values). However, on the positive side, **the normalization reduces the file size dramatically**; for instance, NOAA NAM NEST CONUS grid (2269×976) wind data is **~332 KB as JPEG vs 8.9 MB as ZSTD-compressed float32 GeoTIFF**. The big file size difference translates to big difference in storage and data transfer cost, as well as file loading speed on clientside. Then it should not be a surprise that in Vladimir Agafonkin's [wind map article](https://blog.mapbox.com/how-i-built-a-wind-map-with-webgl-b63022b5537f), he proposed storing normalized grid values in an image like PNG.

For wind (`ParticleMotion`), u-velocity is min–max normalized to 0–255 (uint8) in the R band and v-velocity in the G band; no-data cells use B = 0 (valid cells use B = 255). For a smooth raster (`SmoothRaster`), the scalar attribute is normalized to 0–255 (uint8) in the R band; no-data cells use B = 255 (valid cells use B = 0). The rules are summarized in the following table:

| Layer | R band | G band | B band (NA encoding) |
|-------|--------|--------|----------------------|
| `SmoothRaster` (e.g. temperature, relative humidity, precipitation) | normalized attribute value | 0 | **255** = NA, **0** = valid |
| `ParticleMotion` (e.g., wind, ocean current) | normalized U-component velocity | normalized V-component velocity | **0** = NA, **255** = valid |

Note: The NA encoding schema is introduced in v1.1.0. Please update the package version if you are using v1.0.X and having no-data cells in your dataset.

## Min and max values used for normalization

It is important to **determine the minimum and maximum values used for normalizing continuous, float variable to discrete uint8 values**. There are two main approaches:
1. You have a **reasonable expectation of possible or significant value range of the variable** that you try to map (wind velocity, temperature, etc.). For example, you expect that wind u- or v-component velocity is typically within -50 and 50 m/s range (velocity outside this range is uncommon or not important to differentiate for general mapping purpose); similarly, you expect that temperature is typically within -50 and 50 °C. In such a case, **normalization is always using the same minimum and maximum values that you expect**, regardless of the actual min and max values of the dataset.
2. You prefer **normalization based on the actual dataset min and max values**. This dataset-dependent normalization offers two main benefits: (1) if the actual value range is smaller than the typical expected range, you get a higher value storing precision, (2) if the actual min or max is beyond the typical expected range, you are able to capture those extreme values and map them in a way that better differentiate them from other typical values.

Depending on your preference on the min/max values determination approaches, the appropriate methods for supplying the min/max values to the mapbox-exif-layer can be different:
1. **If you have a reasonable expectation of value range that is constant, dataset-independent**, you can supply the `scalarValueRange` (for `SmoothRaster`) or `velocityRange` (for `ParticleMotion`) constructor option — a 2-element `[min, max]` array. For `SmoothRaster`, this range maps encoded pixel values to physical units when building the colormap (the R band is still read as a normalized 0–255 sample in the shader). For `ParticleMotion`, this range de-normalizes u and v from the R and G bands so particles move at the correct speed and direction.
2. **If you want normalization based on the actual dataset min and max values**, you should use EXIF-enabled JPEG where min/max metadata before normalization is stored in EXIF ImageDescription (details on the EXIF encoding rules are provided in a later section). Kudos to [sakitam-fdd/wind-layer](https://github.com/sakitam-fdd/wind-layer/tree/master/packages/mapbox-gl) for the initial idea of using EXIF image.

You need to **pick one** from the two general methods, and follow the corresponding data processing guidelines outlined below:

### Method 1. Constant, dataset-independent min/max values

Ready-to-use Python scripts for converting raster data (grib2, GeoTIFF etc) to JPEG or PNG image are provided in the GitHub:
- Single scalar / Smooth raster layer: [pipeline/grib2_scalar_to_image_with_fix_min_max.py](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/pipeline/grib2_scalar_to_image_with_fix_min_max.py)

```
python grib2_scalar_to_image_with_fix_min_max.py <input_raster> <output_file> \
  [--scalar-band BAND] \
  --min-value MIN --max-value MAX
```

`BAND` is a 1-based band index (default: `1`) or a GRIB metadata string such as `GRIB_ELEMENT=APCP01`.

Examples:

```bash
# Temperature (band index)
python grib2_scalar_to_image_with_fix_min_max.py reprojected.grib2 temperature.png \
  --scalar-band 1 \
  --min-value -20 --max-value 45
```

```bash
# Hourly precipitation (GRIB attribute)
python grib2_scalar_to_image_with_fix_min_max.py input.grib2 precipitation.png \
  --scalar-band GRIB_ELEMENT=APCP01 \
  --min-value 0 --max-value 50
```

- Wind / Particle motion layer: [pipeline/grib2_uv_to_image_with_fix_min_max.py](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/pipeline/grib2_uv_to_image_with_fix_min_max.py)

```
python grib2_uv_to_image_with_fix_min_max.py <input_raster> <output_file> \
  [--u-band N] [--v-band N] \
  [--min-value MIN] [--max-value MAX]
```

Example:

```bash
python grib2_uv_to_image_with_fix_min_max.py reprojected.grib2 wind.png \
  --u-band 1 --v-band 2 \
  --min-value -50 --max-value 50
```

Notes:
1. The above two scripts use GDAL that is **capable to read any common raster datasets**, not limited to grib2
2. The above two scripts **automatically reproject the datasets to WGS84 (EPSG 4326)**. If you are writing your own script for conversion, make sure to reproject the geospatial file to EPSG 4326 before normalization and writing the image file
3. The above two scripts do NOT encode EXIF information since the min and max values already are input to the scripts
4. Each script also writes **`bounds_<output_stem>.txt`** next to the output image — one line, comma-separated **`minX,maxY,maxX,minY`** (same order as the layer `bounds` option). Example: `wind.png` → `bounds_wind.txt`.

For the front-end JavaScript code, the layer constructor needs an extra parameter to tell the layer the user-defined constant value range (only v1.3.2+ supports this parameter). For `SmoothRaster`, `scalarValueRange` must match the `--min-value` / `--max-value` used when encoding the image, and your `color` stop values should use the same physical units within that range.

```javascript
new SmoothRaster({
  id: 'temperature',
  source: 'path/to/temperature.png',
  bounds: [-121, 36, -117, 32],
  scalarValueRange: [-20, 45],   // Maps encoded values to physical units for the colormap; must match encoding min/max
  color: [
    [-20, [0, 0, 255]],
    [0, [255, 255, 255]],
    [45, [255, 0, 0]],
  ],
  mapRuntime: 'maplibre',
  readyForDisplay: true
});
```

For `ParticleMotion`, `velocityRange` must match the encoding min/max and applies to **both** u and v components. Particle **color** is by wind **speed** (a scalar), not by u/v separately. When the source has no EXIF, the speed colormap range is inferred from your `color` stops (same as GeoTIFF sources) — `velocityRange` does not control coloring. Choose `color` stop values as wind speeds in the same unit as the `unit` option.

```javascript
new ParticleMotion({
  id: 'wind-particle',
  source: 'path/to/wind.png',
  bounds: [-121, 36, -117, 32],
  velocityRange: [-50, 50],   // De-normalizes u/v from R/G; must match encoding min/max
  unit: 'mps',  // Unit for velocityRange and for color stop values (wind speed)
  color: [
    [0, [50, 0, 0]],
    [10, [255, 255, 0]],
    [20, [0, 255, 0]],
  ],  // Speed (m/s) — min/max of these stops sets the colormap range when EXIF is absent
  mapRuntime: 'maplibre',
  readyForDisplay: true
});
```

Note: If the source image has a valid EXIF ImageDescription, scalarValueRange or velocityRange parameter will be ignored even if the value range is manually specified (i.e., the program will try to read the EXIF information first, and look for user provided value range only if EXIF information is not present in the source image)

### Method 2. Dynamic, dataset-dependent min/max values
#### 2.1. EXIF ImageDescription encoding requirements

For `SmoothRaster`, the original dataset min and max of the values (without normalization) are required so the package can map encoded samples to physical units for the colormap; store them in EXIF ImageDescription in the format:

```text
min-attribute-value,max-attribute-value;
```

For `ParticleMotion`, write the original dataset min and max of u- and v-component velocity (without normalization) and the min and max of speed (sqrt(u² + v²)) to EXIF ImageDescription in the format:

```text
min-u-velocity,max-u-velocity;min-v-velocity,max-v-velocity;min-speed,max-speed;
```

Note that if you prefer to use Method 1 constant, dataset-independent min-max normalization with value range defined by yourself, you do not need to worry about EXIF encoding starting v1.3.2

#### 2.2. Manual CRS reprojection

Manual reprojection to EPSG 4326 (WGS 84) is needed.

For example, we can download NOAA HIRESW forecast with following command ([more public data](https://nomads.ncep.noaa.gov/)):

```bash
DATE=$(date -u +%Y%m%d)
HOUR=01  # 00..48
GRIB_FILE="wind_01.grib2"
REPROJECTED_GRIB="reprojected_01.grib2"
curl -f -s -o "$GRIB_FILE" "https://nomads.ncep.noaa.gov/cgi-bin/filter_hiresconus.pl?dir=%2Fhiresw.${DATE}&file=hiresw.t00z.arw_5km.f${HOUR}.conus.grib2&var_UGRD=on&var_VGRD=on&lev_10_m_above_ground=on&subregion=&toplat=36&leftlon=239&rightlon=243&bottomlat=32"
```

Then you can reproject the raster data with [gdalwarp](https://gdal.org/en/stable/programs/gdalwarp.html):

```bash
gdalwarp -t_srs EPSG:4326 -dstnodata -9999 -overwrite \
  "$GRIB_FILE" "$REPROJECTED_GRIB"
```

#### 2.3. Converting geospatial file to EXIF-JPEG

Under the `pipeline/` folder of this repo, there are a few sample JSON files: [jpeg_wind.json](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/pipeline/jpeg_wind.json), [jpeg_temperature_relative_humidity.json](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/pipeline/jpeg_temperature_relative_humidity.json), and [jpeg_precipitation.json](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/pipeline/jpeg_precipitation.json).

Use [pipeline/grib2_to_image.py](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/pipeline/grib2_to_image.py) to convert a reprojected raster into one or more EXIF-enabled JPEG files:

```bash
python grib2_to_image.py <input_raster> <output_suffix> <config_json>
```

| Argument | Description |
|----------|-------------|
| `input_raster` | Path to the input file (GRIB2, GeoTIFF, etc.). Must already be in **EPSG:4326** — the script does not reproject. |
| `output_suffix` | Label inserted into output filenames (e.g. forecast hour `01` → `wind_01.jpeg`). Also used for the bounds sidecar file `bounds_<output_suffix>.txt`. |
| `config_json` | JSON file describing which bands to encode and any unit conversions. |

For each entry in the config, the script writes `<input_dir>/<param_name>/<param_name>_<output_suffix>.jpeg` with dataset min/max values stored in EXIF `ImageDescription`. It also writes `bounds_<output_suffix>.txt` next to the input file — one line, comma-separated values in layer order **`minX,maxY,maxX,minY`** (west, north, east, south in degrees).

**Config JSON structure.** The top-level object maps an output name to a band configuration:

```json
{
  "param_name": {
    "band": 1,
    "to_fahrenheit": false,
    "to_mph": false,
    "to_kph": false
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `band` | yes | Band to read. Integer (1-based), a two-element list for wind u/v (e.g. `[1, 2]`), or a GRIB metadata string such as `"GRIB_ELEMENT=APCP01"`. |
| `to_fahrenheit` | no | Convert band values from °C to °F before normalization (typical for temperature). |
| `to_mph` | no | Convert band values from m/s to mph before normalization (typical for wind). |
| `to_kph` | no | Convert band values from m/s to km/h before normalization. Do not set both `to_mph` and `to_kph`. |

One band → scalar output for `SmoothRaster` (R = value, G = 0, B = NA mask). Two bands → wind output for `ParticleMotion` (R = u, G = v, B = NA mask); speed is computed only to derive min/max for EXIF — it is not written to any RGB band.

Example (continuing from §2.2):

```bash
python grib2_to_image.py "$REPROJECTED_GRIB" "${HOUR}" pipeline/jpeg_wind.json
```

This produces `wind/wind_01.jpeg` and `bounds_01.txt` alongside the input file.

**Note:** Method 2 focuses on **JPEG** output only. The bundled `grib2_to_image.py` pipeline has known limitations when writing EXIF metadata into PNG files, so we do not document or rely on that path here. Nothing in the package prevents you from using an EXIF-enabled PNG as a source if you can produce one yourself (for example with a toolchain that correctly embeds `ImageDescription` in PNG). Our pipeline simply does not robustly support EXIF-in-PNG encoding today.

#### 2.4. Front-end JS code

If you expect that all of your source images are EXIF-JPEG, there is no need to add `scalarValueRange` nor `velocityRange` to the constructor (the package will extract those value ranges from EXIF information):

```javascript
new SmoothRaster({
  id: 'temperature',
  source: 'path/to/temperature.jpeg',
  bounds: [-121, 36, -117, 32],
  color: [
    [-20, [0, 0, 255]],
    [0, [255, 255, 255]],
    [45, [255, 0, 0]],
  ],
  mapRuntime: 'maplibre',
  readyForDisplay: true
});
```

```javascript
new ParticleMotion({
  id: 'wind-particle',
  source: 'path/to/wind.jpeg',
  bounds: [-121, 36, -117, 32],
  unit: 'mps',
  color: [
    [0, [50, 0, 0]],
    [10, [255, 255, 0]],
    [20, [0, 255, 0]],
  ],
  mapRuntime: 'maplibre',
  readyForDisplay: true
});
```

Note: If neither EXIF nor scalarValueRange/velocityRange is available, the layer warns and does not load the image. 
