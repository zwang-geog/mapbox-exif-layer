---
name: weather-raster
description: >-
  Guide users through adding smooth weather raster layers on Mapbox GL JS or MapLibre GL JS
  with mapbox-exif-layer (SmoothRaster). Use when the user asks for temperature, relative
  humidity, precipitation, or other scalar weather fields as a colored, smooth, non-blocky
  map layer, or for small whole-file GeoTIFF visualization on a web map.
---

# Weather raster with mapbox-exif-layer

- Walk through the setup in order.
- Ask **one step at a time** unless the user gave full context upfront.
- Summarize decisions in a short bullet list before writing code.

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

## Step 2 — Raw weather raster data source

**Goal:** Confirm the project has (or can obtain) scalar weather raster data suitable for `SmoothRaster`: a **single physical field** (e.g. temperature, relative humidity, precipitation) on a regular grid.

**Approach:** Combine **asking the user** (workflow and product intent) with **investigating yourself** (file metadata, provider docs, tooling). Do not quiz users on band indices, physical units, or GRIB keys.

Read and follow [weather-raster-checklist.md](references/weather-raster-checklist.md) when entering this step.

**Record before Step 3:** data origin, single vs multi-timestep, raw dataset file format, scalar band identification, **variable/field name**, **dataset physical unit** (from metadata), **display physical unit** (user preference for colormap/legend), source CRS.

---

## Step 3 — Weather delivery format: JPEG/PNG vs GeoTIFF

**When to ask:** After Steps 1–2, once you know which scalar weather variable(s) they will map and have (or will produce) raster data.

**What to do:** Read [weather-delivery-format.md](references/weather-delivery-format.md). **Explain the trade-offs to the user** and **ask them to choose** between Option A (JPEG/PNG) and Option B (GeoTIFF). If they choose JPEG/PNG, **explain the min/max sub-paths**, **ask them** to pick dataset-independent or dataset-dependent scaling, then **confirm output format** (JPEG or PNG for independent; JPEG only for dependent). If they choose GeoTIFF and map **more than one variable**, **ask** multi-band (one GeoTIFF per timestep) vs single-band (one GeoTIFF per variable per timestep).

**Record the choice:** delivery format (`jpeg` | `png` | `geotiff`); min/max strategy (`min-max-independent` | `min-max-dataset-dependent`) for JPEG/PNG. **PNG is only valid with `min-max-independent`.** Dataset-dependent implies **JPEG** (EXIF). For GeoTIFF with multiple variables: packaging (`geotiff-multi-band` | `geotiff-single-band`).

---

## Step 4 — Process data for weather raster delivery

**When to run:** After Step 3, using recorded choices and Step 2 metadata (scalar band indices, variable/field name, dataset and display physical units, source CRS).

**What to do:** **First** follow [install_pipeline_dependency.md](references/install_pipeline_dependency.md) — tell the user required packages, ask Conda vs `venv`, install dependencies. Then open **one** preprocessing reference below, download the script it specifies (if any) with `curl`, and run commands using paths and band indices from Steps 2–3.

| Step 3 choice | Reference |
|---------------|-----------|
| `geotiff` | [source_weather_geotif_prep.md](references/source_weather_geotif_prep.md) |
| `min-max-independent` (JPEG or PNG) | [source_weather_image_constant_range_prep.md](references/source_weather_image_constant_range_prep.md) |
| `min-max-dataset-dependent` (JPEG) | [source_weather_image_dynamic_range_prep.md](references/source_weather_image_dynamic_range_prep.md) |

**Record after Step 4:** output file path(s). **JPEG/PNG:** record **bounds** from the **`bounds_<stem>.txt` sidecar** (required for the layer). **GeoTIFF:** no need to record bounds as it is not required for the layer.

---

## Step 5 — Frontend project setup

Resolve the frontend project in this order:

1. **Project already exists** → inspect the codebase (`package.json`, framework config, existing map setup). **Keep the framework in use.** Install any missing npm packages below; do not re-scaffold.
2. **New project** → **ask the user** which **framework** (e.g. React, Vue, Svelte) and **CSS library** (e.g. Tailwind, MUI) they want, then initialize the project.

Use the **Map SDK from Step 1** to choose the map package. Use **Step 3** to decide whether `geotiff` is needed.

### Install map SDK (one of)

**Mapbox GL JS**:

```bash
npm install mapbox-gl
```

**MapLibre GL JS**:

```bash
npm install maplibre-gl
```

### Install mapbox-exif-layer

```bash
npm install mapbox-exif-layer
```

### GeoTIFF peer dependency (Step 3 = `geotiff` only)

```bash
npm install geotiff
```

JPEG/PNG-only setups do **not** need `geotiff`.

---

## Step 6 — Add weather raster layer

**When to run:** After Step 5, using recorded values from Steps 1–4 (SDK, `source` path, bounds sidecar for JPEG/PNG, `velocityRange` if dataset-independent).

**What to do:** Open the reference for the **Map SDK from Step 1**. Wire `SmoothRaster` with the processed weather file and bounds; add the layer to the map.

| Step 1 SDK | Reference |
|------------|-----------|
| Mapbox GL JS | [add-weather-raster-mapbox.md](references/add-weather-raster-mapbox.md) |
| MapLibre GL JS | [add-weather-raster-maplibre.md](references/add-weather-raster-maplibre.md) |

Optional constructor parameters to mention if relevant:

- `cacheOption` (string): Cache option for fetching the source image — `no-cache` (default), `no-store`, `reload`, `default`, or `force-cache`.
- `slot` (string, Mapbox GL JS only): [Slot](https://docs.mapbox.com/style-spec/reference/slots/) identifier for layer ordering; typical values are `"top"`, `"middle"` (recommended), or `"bottom"`.

---
