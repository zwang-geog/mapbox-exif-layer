# Add weather raster layer — Mapbox GL JS

Use after Steps 1–5. Substitute **`source`**, **`bounds`**, and **`color`** from Steps 2–4 (JPEG/PNG: `bounds` from `bounds_<stem>.txt` sidecar; GeoTIFF: `bounds` optional).

```javascript
import mapboxgl from 'mapbox-gl';
import { SmoothRaster } from 'mapbox-exif-layer';
import 'mapbox-gl/dist/mapbox-gl.css';
```

Set `mapboxgl.accessToken` before creating the map.

## Map

```javascript
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/dark-v11',
  zoom: 7,
  center: [-119.699944, 34.432546],
  projection: 'mercator'  // Required for mapbox-exif-layer (not globe)
});
```

## Recommended pattern — one layer, radio variable switcher

Use a **single `SmoothRaster` instance** shared across all weather variables. Initialize it with the default variable, then switch source and color together via `setSource` when the user picks a different variable (radio button or similar). This avoids managing multiple layers and multiple visibility states.

Define color arrays as named constants:

```javascript
const TEMPERATURE_COLOR = [
  [26, [0, 137, 255]],
  [28, [0, 155, 255]],
  [30, [0, 176, 255]],
  [32, [0, 194, 255]],
  [34, [0, 214, 254]],
  [36, [5, 235, 242]],
  [38, [19, 251, 228]],
  [40, [36, 255, 211]],
  [42, [50, 255, 197]],
  [44, [67, 255, 180]],
  [46, [81, 255, 166]],
  [48, [98, 255, 149]],
  [50, [115, 255, 131]],
  [52, [132, 255, 115]],
  [54, [149, 255, 98]],
  [56, [163, 255, 84]],
  [58, [180, 255, 67]],
  [60, [194, 255, 52]],
  [62, [211, 255, 36]],
  [64, [228, 255, 19]],
  [66, [242, 251, 5]],
  [68, [254, 232, 0]],
  [70, [255, 215, 0]],
  [72, [255, 196, 0]],
  [74, [255, 179, 0]],
  [76, [255, 159, 0]],
  [78, [255, 140, 0]],
  [80, [255, 121, 0]],
  [82, [255, 102, 0]],
  [84, [255, 85, 0]],
  [86, [255, 66, 0]],
  [88, [255, 50, 0]],
  [90, [255, 30, 0]],
  [92, [249, 14, 0]],
  [94, [225, 1, 0]],
  [96, [202, 0, 0]],
  [98, [181, 0, 0]],
  [100, [158, 0, 0]]
];  // °F example; [scalar value, [R, G, B]]

const RH_COLOR = [
  [5, [149, 89, 16]],    // values below 5 render with the same color as 5
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
];  // %

const PRECIPITATION_COLOR = [
  [0.249999, [4, 232, 231, 0]],  // below 0.25 → fully transparent
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
];  // mm/hr example; use a [R, G, B, A=0] stop to make near-zero values transparent
```

Initialize a single layer with the default variable:

```javascript
const weatherLayer = new SmoothRaster({
  id: 'weather',
  source: 'path/to/your/temperature.jpeg',  // or .png / .tif / .tiff
  color: TEMPERATURE_COLOR,
  bounds: [-121, 36, -117, 32],  // [minX, maxY, maxX, minY] — required for JPEG/PNG; optional for GeoTIFF
  readyForDisplay: true,  // true to show on initial load; omit or false if toggled on later
  opacity: 0.6
});
```

If Step 3 used **dataset-independent** JPEG/PNG, add `scalarValueRange` matching the encoding min/max for the initial variable:

```javascript
scalarValueRange: [-20, 45],  // same as --min-value / --max-value in preprocessing
```

For **GeoTIFF multi-band** (Step 3 packaging `geotiff-multi-band`), add `scalarBand` (0-based) for the initial variable:

```javascript
scalarBand: 0,  // 0-based band index within the GeoTIFF
```

In React, if the app allows switching between basemap styles (e.g. dark, light, satellite), wrap the layer instance in a `useRef` so the same object is re-added when `style.load` fires again after a style change — a new object would lose the current source and color state:

```javascript
const weatherLayerRef = useRef(new SmoothRaster({
  id: 'weather',
  source: 'path/to/your/temperature.jpeg',
  color: TEMPERATURE_COLOR,
  bounds: [-121, 36, -117, 32],
  readyForDisplay: true,
  opacity: 0.6
}));
```

## Add layer to map

Prefer `style.load` when the basemap style can change; otherwise prefer `load`.

```javascript
map.on('style.load', () => {
  map.addLayer(weatherLayer, 'road-label-simple');
  // 'road-label-simple' is the optional beforeId in dark-v11 to place the layer below labels; other styles may differ such as 'road-label'
});
```

**TypeScript projects:** `mapbox-exif-layer`'s `.d.ts` does not formally declare `SmoothRaster` as implementing `mapboxgl.CustomLayerInterface`, though it does so at runtime. Cast to suppress the type error:

```typescript
map.on('style.load', () => {
  map.addLayer(weatherLayer as unknown as mapboxgl.CustomLayerInterface, 'road-label-simple');
});
```

## Radio variable switcher

When the user selects a different variable, call `setSource` with both the new URL and the new color array — both update atomically and the layer repaints:

> **Note:** Switching `scalarBand` after construction is **not supported** — the band index is fixed at initialization. For **GeoTIFF multi-band** sources where each variable lives in a different band of the same file, initialize **one `SmoothRaster` per variable** (each with its own `scalarBand`) and toggle visibility between them instead of using the radio switcher pattern above.

```javascript
// temperature selected
weatherLayer.setSource('path/to/temperature.jpeg', TEMPERATURE_COLOR);

// relative humidity selected
weatherLayer.setSource('path/to/rh.jpeg', RH_COLOR);

// precipitation selected
weatherLayer.setSource('path/to/precipitation.jpeg', PRECIPITATION_COLOR);
```

## Toggle layer using normal setLayoutProperty method

```javascript
map.setLayoutProperty('weather', 'visibility', 'visible');  // show
map.setLayoutProperty('weather', 'visibility', 'none');     // hide
```

## To keep the weather layer hidden/off when map load and visible only after user toggle on

If the layer needs to be hidden/off when the map is initially loaded, the constructor needs to have `readyForDisplay` omitted or set to false.

```javascript
const weatherLayer = new SmoothRaster({
  id: 'weather',
  source: 'path/to/your/temperature.jpeg',  // or .png / .tif / .tiff
  color: TEMPERATURE_COLOR,
  bounds: [-121, 36, -117, 32],  // [minX, maxY, maxX, minY] — required for JPEG/PNG; optional for GeoTIFF
  // readyForDisplay is omitted, which then is assumed to false - layer not displayed on map load
  opacity: 0.6
});
```

Once the layer is added to the map in `style.load` or `load` event listener, delegates the visibility control to Mapbox:

```javascript
map.on('style.load', () => {
  map.addLayer(weatherLayer, 'road-label-simple');  // 'road-label-simple' is the optional beforeId in dark-v11 to place the layer below labels; other styles may differ such as 'road-label'

  map.setLayoutProperty('weather', 'visibility', 'none');  // keep hidden until user toggles on
  weatherLayer.readyForDisplay = true;  // allow rendering; Mapbox visibility still controls what the user sees
});
```

**TypeScript:** use the same cast described in the "Add layer to map" section:

```typescript
map.on('style.load', () => {
  map.addLayer(weatherLayer as unknown as mapboxgl.CustomLayerInterface, 'road-label-simple');

  map.setLayoutProperty('weather', 'visibility', 'none');
  weatherLayer.readyForDisplay = true;
});
```

Then the layer can be toggled like other vector or raster layers:

```javascript
map.setLayoutProperty('weather', 'visibility', 'visible');  // show
map.setLayoutProperty('weather', 'visibility', 'none');     // hide
```

Essentially, `readyForDisplay` is used to prevent rendering when the layer is first added. After you set it to `true`, use `setLayoutProperty` for routine toggling — do not flip `readyForDisplay` back to `false` to hide the layer.

## Update source for a new timestep

```javascript
weatherLayer.setSource('path/to/temperature_02.jpeg');  // color schema keeps the same as before
```
