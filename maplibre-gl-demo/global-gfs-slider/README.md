# Global GFS slider

MapLibre GL JS demo of the public GFS overlay:

- `https://www.mapbox-exif-layer.com/gfs/0p25/status.json`
- `https://www.mapbox-exif-layer.com/gfs/0p25/{wind|temperature|rh}/{var}_{YYYYMMDDHH}.jpeg`

The slider is built from `status.json` (hourly through `hourly_until`, then 3-hourly through `three_hourly_until`). Temperature is °C; wind is m/s. No Mapbox token.

## Run

```bash
npm install
npm run dev
```

Optional: `VITE_MAP_STYLE` to override the OpenFreeMap dark style.
