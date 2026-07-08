# Mapbox GL JS vs MapLibre GL JS

Trade-offs for choosing a map SDK when adding wind particles with mapbox-exif-layer.

## Mapbox GL JS

| Topic | Summary |
|-------|---------|
| **License** | Proprietary library (Mapbox Terms of Service). Free tier available; commercial use is governed by Mapbox pricing and your account plan. |
| **Basemap / tiles** | A **Mapbox access token** is required. Mapbox provides high-quality basemaps and tileset hosting services. |
| **Cost drivers** | Map **loads**, **tileset hosting** (priced by tileset-hour), **tileset processing** (CPU time and processed data size), and **commercial licensing fees** for qualified commercial applications — not the wind layer library itself. |
| **Globe** | Mapbox basemap styles can use globe projection, but **this wind particle layer is not compatible with globe** — keep the map projection on **Mercator**. |

**Good fit when:** You already pay for or are standardized on Mapbox, need Mapbox-specific tooling/styles, or your org mandates Mapbox.

## MapLibre GL JS

| Topic | Summary |
|-------|---------|
| **License** | **Open-source** map renderer (BSD-style). No Mapbox token required for the library itself. |
| **Basemap / tiles** | You choose a **tile provider** (e.g. MapTiler, Stadia, Protomaps, self-hosted OpenMapTiles, your own MBTiles server). Commercial terms and pricing depend on **that provider**, not MapLibre. |
| **Cost drivers** | Tile hosting/bandwidth from your chosen provider; MapLibre GL JS has no per-load fee from MapLibre. |
| **Globe** | MapLibre supports **globe projection**, which is compatible with this wind particle layer — useful for global wind views. |

**Good fit when:** You want to avoid Mapbox vendor lock-in, self-host tiles, or need globe projection.
