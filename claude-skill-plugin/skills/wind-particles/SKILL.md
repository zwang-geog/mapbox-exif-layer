---
name: wind-particles
description: >-
  Guide users through adding wind particle layers on Mapbox GL JS or MapLibre GL JS
  with mapbox-exif-layer (ParticleMotion). Use when the user asks for wind particles,
  animated wind map, u/v velocity field, GRIB wind, or ocean-current flow on a web map.
---

# Wind particles with mapbox-exif-layer

Walk the user through setup in order. **Do not skip ahead to code** until the relevant step is answered. If the user already stated an answer, confirm briefly and move on.

**Workspace:** Treat the user’s project as a standalone app (e.g. React + Mapbox/MapLibre). Before Step 4 preprocessing, install GDAL/Python dependencies — see [install_pipeline_dependency.md](references/install_pipeline_dependency.md).

Package: [`mapbox-exif-layer`](https://www.mapbox-exif-layer.com) (npm) — `ParticleMotion` custom layer. Docs: [JPEG/PNG](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/docs/jpeg-source.md), [GeoTIFF](https://github.com/zwang-geog/mapbox-exif-layer/blob/main/docs/geotiff-source.md).

---

## Step 1 — Map SDK

Resolve the SDK in this order:

1. **User already named an SDK** → use it. Confirm briefly; do not ask them to switch.
2. **User did not name an SDK, but the project already uses one** → inspect the codebase (`package.json` for `mapbox-gl` vs `maplibre-gl`, imports, map initialization). **Keep that SDK.** Confirm briefly with the user.
3. **Otherwise** → ask using the prompt below. If they want trade-offs, read [map-sdk-tradeoffs.md](references/map-sdk-tradeoffs.md) and present it.

Record the choice for later implementation.

### How to ask (branch 3 only)

> Do you already have a preference between **Mapbox GL JS** and **MapLibre GL JS**? Or would you like me to show the trade-offs between the two SDKs?

---

## Step 2 — Raw wind data source

**Goal:** Confirm the project has (or can obtain) wind raster data suitable for `ParticleMotion`: **u- and v-component velocity** on a regular grid.

**Approach:** Combine **asking the user** (workflow and product intent) with **investigating yourself** (file metadata, provider docs, tooling). Do not quiz users on band indices, velocity units, or GRIB keys.

Read and follow [wind-data-checklist.md](references/wind-data-checklist.md) when entering this step.

**Record before Step 3:** data origin, single vs multi-timestep, raw dataset file format, u/v band identification, **dataset velocity unit** (from metadata), **display velocity unit** (user preference for the map), source CRS.

---

## Step 3 — Wind delivery format: JPEG/PNG vs GeoTIFF

**When to ask:** After Steps 1–2, once you know they have (or will produce) u/v raster data.

**What to do:** Read [wind-delivery-format.md](references/wind-delivery-format.md). **Explain the trade-offs to the user** and **ask them to choose** between Option A (JPEG/PNG) and Option B (GeoTIFF). If they choose JPEG/PNG, **explain the min/max sub-paths**, **ask them** to pick dataset-independent or dataset-dependent scaling, then **confirm output format** (JPEG or PNG for independent; JPEG only for dependent).

**Record the choice:** delivery format (`jpeg` | `png` | `geotiff`); min/max strategy (`min-max-independent` | `min-max-dataset-dependent`). **PNG is only valid with `min-max-independent`.** Dataset-dependent implies **JPEG** (EXIF).

---

## Step 4 — Process data for wind delivery

**When to run:** After Step 3, using recorded choices and Step 2 metadata (u/v bands, dataset and display velocity units, source CRS).

**What to do:** **First** follow [install_pipeline_dependency.md](references/install_pipeline_dependency.md) — tell the user required packages, ask Conda vs `venv`, install dependencies. Then open **one** preprocessing reference below, download the script it specifies (if any) with `curl`, and run commands using paths and band indices from Steps 2–3.

| Step 3 choice | Reference |
|---------------|-----------|
| `geotiff` | [source_wind_geotif_prep.md](references/source_wind_geotif_prep.md) |
| `min-max-independent` (JPEG or PNG) | [source_wind_image_constant_range_prep.md](references/source_wind_image_constant_range_prep.md) |
| `min-max-dataset-dependent` (JPEG) | [source_wind_image_dynamic_range_prep.md](references/source_wind_image_dynamic_range_prep.md) |

**Record after Step 4:** output file path(s). **JPEG/PNG:** record **bounds** from the **`bounds_<stem>.txt` sidecar** (required for the layer). **GeoTIFF:** no need to record bounds as it is not required for the layer.

---

## Agent behavior

- Ask **one step at a time** unless the user gave full context upfront.
- Summarize decisions in a short bullet list before writing code.
- Do **not** suggest `maplibre-gl-wind` or other packages unless the user explicitly asks for alternatives.
- Link to official docs above rather than inventing encoding rules.
