# Mapbox EXIF Layer

[![npm version](https://badge.fury.io/js/mapbox-exif-layer.svg)](https://badge.fury.io/js/mapbox-exif-layer)

Custom Mapbox GL JS layers for rendering particle motion (e.g., wind) or smooth raster (e.g., temperature, relative humidity, precipitation) based on EXIF-enabled JPEG images

**Feature Highlights**
* A mapbox built-in [custom layer](https://docs.mapbox.com/mapbox-gl-js/api/properties/#customlayerinterface) instead of some canvas overlay so it is natively integrated with mapbox 
* The particle position and age are stored as buffer, while the computation of new particle position is done in a vertex shader dedicated for updates, and particle motion is powered by transform feedback (overall, GPU-based instead of CPU-based)
* Single image with EXIF information as source (as simple as uploading the image to a public accessible AWS S3 bucket), no need to setup any tile server 
* Works for browsers on both desktop/laptop and iPhone/iPad
* Wind particles can have varying colors based on speed, and particle movement respect the relative u- and v-component velocity rather than moving at the same rate
* Well-suited for displaying local or regional forecast results
* Method for updating the source url is available, so setting forecast for different timestamps can be done easily

**[Demo website (source code under react-demo/real-time-example)](mapbox-exif-layer.onrender.com)**
**[Demo video recording](https://www.youtube.com/watch?v=HLu0Ylhu5x4)**
**[Technique Explanation](https://medium.com/@zifanw9/a-low-cost-custom-wind-particle-motion-layer-in-mapbox-gl-js-9a51978e3ffb)**

## Background and Data Requirement

Smooth raster layer (a.k.a. sample fill in [windgl](https://github.com/astrosat/windgl/tree/master), colorize in [wind-layer](https://blog.sakitam.com/wind-layer/playgrounds/mapbox-gl/colorize.html)) is just a different way to render the classic raster data on the web browser. The raw raster data consist of a grid of cells with each cell has one or more bands storing some kind of values (e.g., temperature), and a cell has a size (1/4 degrees, 5 km, 500 m, etc) making it looks like a box. The conventional way to render such data on the web is to generate a set of images by assigning colors to each cell and serving those images via a tile server; the eventual result is blocky, coarse cells appearing as a layer, just like what you typically see on a desktop GIS software like QGIS. For certain data such as weather data, we would expect strong spatial autocorrelation, and a smooth display of such data will be desired. With WebGL's varyings and fragment shader, automatic interpolation of colors across the space on clientside is possible (see [WebGL fundamentals](https://webglfundamentals.org/webgl/lessons/webgl-fundamentals.html)), and we do not need to worry about doing interpolation or down-scaling of the raster data ourselves to make the layer looks smooth for web visualization.

To use this package for displaying smooth raster layer or particle motion layer, we need to first **reproject the raw raster data into WGS 1984 (EPSG 4326)**.

For rendering smooth raster, the band of the attribute to map needs to have its values normalized to an integer between 0-255 and stored as R-band of a JPEG image. The min and max of the values without normalization is needed for the package to de-normalize the pixel values to the actual values. This package assumes such information to be stored as the EXIF image description, and in fact that is where the name of this package comes from. This idea of using EXIF is inspired by [wind-layer](https://github.com/sakitam-fdd/wind-layer/tree/master/packages/mapbox-gl). The idea of using an image to store normalized band values can be traced back to Vladimir Agafonkin's [article](https://blog.mapbox.com/how-i-built-a-wind-map-with-webgl-b63022b5537f). For smooth raster, the EXIF image description should be in the format of `min-attribute-value,max-attribute-value;`

For rendering wind as particles, the u- and v-component velocity need to be converted to an unit in mph (m/s or km/h might also be possible, but not tested; see Usage Reminder for details), normalized to an integer between 0-255, and stored as R-band and G-band of a JPEG image, respectively; there is no requirement for B-band. Additionally, the min and max of u- and v-component velocity (without normalization), as well as the min and max of speed in mph (sqrt(u * u, v * v)) need to be written to EXIF image description in the format of `min-u-velocity,max-u-velocity;min-v-velocity,max-v-velocity;min-speed,max-speed;`

Under pipeline folder of this repo, there is a Python script with associated sample json files (based on NOAA HIRESW forecast) for converting grib2 to EXIF-enabled JPEG images. Let us say we want to get NOAA HIRESW forecast for wind in southern California, we can write a bash script that utilizes following commands ([more public available data](https://nomads.ncep.noaa.gov/)):
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

**Usage Reminder**
1. The shader programs uses a formula to convert mph to lat and long per hour (applicable to ParticleMotion layer only) for determining particle displacement, and the data that I use is mph. Before I package the original code, I add an `unit` parameter in the constructor which you can set it to "kph" (km/h) or "mps" (m/s), and the package will performs an unit conversion on the values parsed from the EXIF info. I am unsure how such an addition will work.
2. When initializing the map canvas, projection needs to be explicitly set to 'mercator' because the custom layers available in this package only works for mercator projection (many Mapbox styles assume a globe projection).

## Installation

```bash
npm install mapbox-exif-layer
```

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
  projection: 'mercator'  // Projection must be explicitly set to mercator (not globe which is the default for style such as dark-v11)
});

// Defining particle motion layer for wind
const particleLayer = new ParticleMotion({
  id: 'wind-particle',
  source: 'path/to/your/exif/image.jpeg',    // For simple deployment, you can upload the image to your public AWS S3 bucket with proper CORS policy and use its URL
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
          [42, [128, 0, 0]]],   // [ [Wind speed in mph, [R, G, B]] ...]
  bounds: [-121, 36, -117, 32],    // [minX, maxY, maxX, minY]
  readyForDisplay: true  // Only set this parameter to true if you want this layer to show up when the map is initially loaded. Otherwise (you have many layers but this layer is not to be shown up without toggeling), you do not need to specify this parameter
});

// Defining smooth raster layer for relative humidity 
const relativeHumidityLayer = new SmoothRaster({
  id: 'relative-humidity',
  source: 'path/to/your/exif/image.jpeg',
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

**Aside**

Although the color parameter defines an array of discrete value-RGB mappings, the package will always interpolate based on the given mappings and the min/max info in EXIF to create a texture with a total of 256 discrete color steps, and the final effect will be a color schema that seems to be continuous. If you want to color the raster in a complete discrete manner, this package will not be suitable. A continuous color schema is important in helping smooth raster layer look smooth.

## Available Class Reference

### ParticleMotion

A particle-based visualization layer that creates animated particles, suitable for wind direction and speed visualization

#### Options

- `id` (string): Unique layer ID
- `source` (string): URL of the EXIF-enabled raster image
- `color` (array): Array of color stops `[value, [r, g, b]]`. Values do not have to be ordered since sorting is performed internally by the package.
- `bounds` (array): Longitude (possible range -180 to 180) and latitude (possible range -90 to 90) of top-left and bottom-right corners of the extent in the format of `[minX, maxY, maxX, minY]`
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
- `unit` (string): Unit of the wind velocity values in the EXIF data (needs to be consistent with the unit in color parameter). Can be one of:
  - `'mph'` (default): Miles per hour
  - `'kph'`: Kilometers per hour
  - `'mps'`: Meters per second

#### Methods

- `setSource(source, percentParticleWhenSetSource = 0.5)` : Changes the URL of the EXIF-enabled wind image, and optionally the proportion of particles whose positions must be reset when the source is updated (default half of the particles). The layer will repaint automatically.

### SmoothRaster

A raster visualization layer that provides a smooth display of the data.

#### Options

- `id` (string): Unique layer ID
- `source` (string): URL of the EXIF-enabled raster image
- `color` (array): Array of color stops `[value, [r, g, b]]`. Values do not have to be ordered since sorting is performed internally by the package. An optional A-band (opacity) value can also be specified, but interpolation will not be applied to A-band. A-band is useful for rendering precipitation by setting all zero or near-zero precipitation cells completely transparent (see Usage example).
- `bounds` (array): Longitude (possible range -180 to 180) and latitude (possible range -90 to 90) of top-left and bottom-right corners of the extent in the format of `[minX, maxY, maxX, minY]`
- `opacity` (number): Layer global opacity (default: 1.0)
- `readyForDisplay` (bool): Preventing the layer from rendering when the layer is added to the map, if necessary (default: false)

#### Methods

- `setSource(source, color=null)` : Changes the URL of the EXIF-enabled raster image, and optionally color array (default is to use the same color array as before). The layer will repaint automatically.

## Acknowledgement

The shader utility code of this package is built upon the util.js of [mapbox/webgl-wind](https://github.com/mapbox/webgl-wind/blob/master/src/util.js). The idea of EXIF is credit to [sakitam-fdd/wind-layer](https://github.com/sakitam-fdd/wind-layer).

## License

MIT 