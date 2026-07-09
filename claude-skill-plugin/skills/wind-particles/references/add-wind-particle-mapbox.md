# Add wind particle layer — Mapbox GL JS

Use after Steps 1–5. Substitute **`source`**, **`bounds`**, **`unit`**, and **`color`** from Steps 2–4 (JPEG/PNG: `bounds` from `bounds_<stem>.txt` sidecar; GeoTIFF: `bounds` optional).

```javascript
import mapboxgl from 'mapbox-gl';
import { ParticleMotion } from 'mapbox-exif-layer';
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
  projection: 'mercator'  // Required for mapbox-exif-layer wind particles (not globe)
});
```

## ParticleMotion layer

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
  readyForDisplay: true
}));
```

## Add layer to map

Prefer `style.load` when the basemap style can change; otherwise prefer `load`.

```javascript
map.on('style.load', () => {
  map.addLayer(particleLayer, 'road-label-simple');  // 'road-label-simple' is the optional beforeId — layer id in dark-v11; other styles may differ such as 'road-label'
});
```

**TypeScript projects:** `mapbox-exif-layer`'s `.d.ts` does not formally declare `ParticleMotion` as implementing `mapboxgl.CustomLayerInterface`, though it does so at runtime. Cast to suppress the type error:

```typescript
map.on('style.load', () => {
  map.addLayer(particleLayer as unknown as mapboxgl.CustomLayerInterface, 'road-label-simple');
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
  bounds: [-121, 36, -117, 32]
  // readyForDisplay is omitted, which then is assumed to false - layer not displayed on map load
});
```

Once the layer is added to the map in `style.load` or `load` event listener, delegates the visibility control to Mapbox:

```javascript
map.on('style.load', () => {
  map.addLayer(particleLayer, 'road-label-simple');  // 'road-label-simple' is the optional beforeId in dark-v11 to place the layer below labels; other styles may differ such as 'road-label'

  map.setLayoutProperty('wind-particle', 'visibility', 'none');  // keep hidden until user toggles on
  particleLayer.readyForDisplay = true;  // allow rendering; Mapbox visibility still controls what the user sees
});
```

**TypeScript:** use the same cast described in the "Add layer to map" section:

```typescript
map.on('style.load', () => {
  map.addLayer(particleLayer as unknown as mapboxgl.CustomLayerInterface, 'road-label-simple');

  map.setLayoutProperty('wind-particle', 'visibility', 'none');
  particleLayer.readyForDisplay = true;
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
