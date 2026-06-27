# React demo

Local demo for `mapbox-exif-layer` (wind particles and temperature raster).

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` and set your [Mapbox access token](https://account.mapbox.com/access-tokens/):

```
VITE_MAPBOX_ACCESS_TOKEN=pk.your_token_here
```

## Run

```bash
npm run dev
```

## Build

The token is read from the environment at build time (Vite inlines `VITE_*` variables):

```bash
npm run build
```

For CI or hosting (e.g. Render), set `VITE_MAPBOX_ACCESS_TOKEN` in the build environment before running `npm run build`.
