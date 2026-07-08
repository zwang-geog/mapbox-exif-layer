# Add wind particle layer — MapLibre GL JS

Use after Steps 1–5. Substitute **`source`**, **`bounds`**, **`unit`**, and **`color`** from Steps 2–4 (JPEG/PNG: `bounds` from `bounds_<stem>.txt` sidecar; GeoTIFF: `bounds` optional).

```javascript
import maplibregl from 'maplibre-gl';
import { ParticleMotion } from 'mapbox-exif-layer';
import 'maplibre-gl/dist/maplibre-gl.css';
```

## Map

Use any MapLibre-compatible style URL (no Mapbox token required for third-party styles):

```javascript
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/dark',
  zoom: 7,
  center: [-119.699944, 34.432546]
});
```

## Globe projection (optional)

Wind particles work with MapLibre **globe** projection:

```javascript
map.on('style.load', () => {
  map.setProjection({ type: 'globe' });
});
```

## ParticleMotion layer

Set **`mapRuntime: 'maplibre'`** on every `ParticleMotion` instance.

```javascript
const particleLayer = new ParticleMotion({
  id: 'wind-particle',
  source: 'path/to/your/wind.jpeg',  // or .png / .tif / .tiff
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
          [42, [128, 0, 0]]],   // [wind speed, [R, G, B]] — speeds use same unit as `unit`
  unit: 'mph',  // `mps` | `mph` | `kph` — match display unit from Step 2
  bounds: [-121, 36, -117, 32],    // [minX, maxY, maxX, minY] — required for JPEG/PNG; optional for GeoTIFF
  mapRuntime: 'maplibre',    // This must be specified for MapLibre
  readyForDisplay: true  // true to show on initial load; omit or false if toggled on later
});
```

If Step 3 used **dataset-independent** JPEG/PNG, add `velocityRange` matching encoding min/max:

```javascript
velocityRange: [-50, 50],  // same as --min-value / --max-value in preprocessing
```

In React, if the app allows switching between basemap styles (e.g. dark, light, satellite), wrap the layer instance in a `useRef` so the same object is re-added when `style.load` fires again after a style change — a new object would lose the current source and color state:

```javascript
const particleLayerRef = useRef(new ParticleMotion({
  id: 'wind-particle',
  source: 'path/to/your/wind.jpeg',
  color: WIND_COLOR,
  unit: 'mph',
  bounds: [-121, 36, -117, 32],
  mapRuntime: 'maplibre',
  readyForDisplay: true
}));
```

## Add layer to map

Prefer `style.load` when the basemap style can change; otherwise prefer `load`.

```javascript
map.on('style.load', () => {
  map.addLayer(particleLayer);
});
```

## Toggle layer using normal setLayoutProperty method

```javascript
map.setLayoutProperty('wind-particle', 'visibility', 'visible');  // show
map.setLayoutProperty('wind-particle', 'visibility', 'none');     // hide
```

## To keep the wind layer hidden/off when map load and visible only after user toggle on

If the layer needs to be hidden/off when the map is initially loaded, the constructor needs to have `readyForDisplay` omitted or set to `false`.

```javascript
const particleLayer = new ParticleMotion({
  id: 'wind-particle',
  source: 'path/to/your/wind.jpeg',
  color: WIND_COLOR,
  unit: 'mph',
  bounds: [-121, 36, -117, 32],
  mapRuntime: 'maplibre'
  // readyForDisplay is omitted, which then is assumed to false - layer not displayed on map load
});
```

Once the layer is added to the map in `style.load` or `load` event listener, delegates the visibility control to MapLibre:

```javascript
map.on('style.load', () => {
  map.addLayer(particleLayer);

  map.setLayoutProperty('wind-particle', 'visibility', 'none');  // keep hidden until user toggles on
  particleLayer.readyForDisplay = true;  // allow rendering; MapLibre visibility still controls what the user sees
});
```

Then the layer can be toggled like other vector or raster layers:

```javascript
map.setLayoutProperty('wind-particle', 'visibility', 'visible');  // show
map.setLayoutProperty('wind-particle', 'visibility', 'none');     // hide
```

Essentially, `readyForDisplay` is used to prevent rendering when the layer is first added. After you set it to `true`, use `setLayoutProperty` for routine toggling — do not flip `readyForDisplay` back to `false` to hide the layer.

## Change source (e.g. time slider)

```javascript
particleLayer.setSource('url/to/a/different/wind.jpeg');
```

Optional second argument: fraction of particles to reset positions (default `0.5`):

```javascript
particleLayer.setSource('url/to/a/different/wind.jpeg', 0.7);
```
