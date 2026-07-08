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

## Add layer to map

Prefer `style.load` when the basemap style can change; otherwise prefer `load`.

```javascript
map.on('style.load', () => {
  map.addLayer(particleLayer, 'road-label-simple');  // 'road-label-simple' is the optional beforeId — layer id in dark-v11; other styles may differ such as 'road-label'
});
```

## Layer toggle (show after initial load)

Use this when the wind layer should **not** appear until the user turns it on (e.g. a checkbox or “Wind” button), or when you need to turn it off and on again later.

### Start with the layer off

Omit `readyForDisplay` or set it to `false` when creating the layer. The layer is still **added to the map** on load — it simply does not render until you opt in:

```javascript
const particleLayer = new ParticleMotion({
  id: 'wind-particle',
  source: 'path/to/your/wind.jpeg',
  color: WIND_COLOR,
  unit: 'mph',
  bounds: [-121, 36, -117, 32]
  // no readyForDisplay — defaults to false; layer will not render yet
});

map.on('style.load', () => {
  map.addLayer(particleLayer, 'road-label-simple');
  map.setLayoutProperty('wind-particle', 'visibility', 'none');  // keep hidden until user toggles on
  particleLayer.readyForDisplay = true;  // allow rendering; visibility still controls what the user sees
});
```

### Two properties, two jobs

| Property | Purpose |
|----------|---------|
| `readyForDisplay` | Gate for **whether the custom layer is allowed to render at all**. Defaults to `false`. Must be `true` before particles can appear. |
| `map.setLayoutProperty(..., 'visibility', ...)` | Standard Mapbox show/hide, same as any other layer. Use this for **user-facing on/off** once `readyForDisplay` is `true`. |

`readyForDisplay` only prevents rendering when the layer is first added. After you set it to `true`, use `setLayoutProperty` for routine toggling — do not flip `readyForDisplay` back to `false` to hide the layer.

### Toggle handler

Use one helper for button on/off. It sets `readyForDisplay` on first show when needed (e.g. if you skipped setting it in `style.load`) then uses `setLayoutProperty` for visibility:

```javascript
function setLayerVisibility(layerId, layerRef, visible) {
  if (!map) return;
  if (visible && layerRef.readyForDisplay !== true) {
    layerRef.readyForDisplay = true;
  }
  map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
}

// button click
setLayerVisibility('wind-particle', particleLayer, true);   // turn on
setLayerVisibility('wind-particle', particleLayer, false);  // turn off
```

If you already set `readyForDisplay = true` in `style.load`, the check on first show is a no-op.

In React, keep the layer in a `useRef`, run the `style.load` setup before enabling controls, and disable the toggle until the map is ready.

## Change source (e.g. time slider)

```javascript
particleLayer.setSource('url/to/a/different/wind.jpeg');
```

Optional second argument: fraction of particles to reset positions (default `0.5`):

```javascript
particleLayer.setSource('url/to/a/different/wind.jpeg', 0.7);
```
