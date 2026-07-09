---
name: wind-particles
description: >-
  Guide users through adding wind particle layers on Mapbox GL JS or MapLibre GL JS
  with mapbox-exif-layer (ParticleMotion). Use when the user asks for wind particles,
  animated wind map, u/v velocity field, GRIB wind, or ocean-current flow on a web map.
---

# Wind particles with mapbox-exif-layer

- Walk through the setup in order.
- Ask **one step at a time** unless the user gave full context upfront.
- Summarize decisions in a short bullet list before writing code.
- If user asks why using mapbox-exif-layer for wind particle mapping, reference to the official site https://www.mapbox-exif-layer.com/ for Frequently Asked Questions such as how it differ from other wind-mapping solutions as well as working demo sites

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

## Step 5 — Frontend project setup

Resolve the frontend project in this order:

1. **Project already exists** → inspect the codebase (`package.json`, framework config, existing map setup, presence of `tsconfig.json` or `.ts`/`.tsx` files). **Keep the framework and language in use.** Record whether the project uses **TypeScript or JavaScript**. Install any missing npm packages below; do not re-scaffold.
2. **New project** → **ask the user**:
   - Which **framework** (e.g. React, Vue, Svelte) and **CSS library** (e.g. Tailwind, MUI) they want
   - **TypeScript or JavaScript?**

   Then initialize the project accordingly. Record the language choice for Step 6.

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

## Step 6 — Add wind particle layer

**When to run:** After Step 5, using recorded values from Steps 1–4 (SDK, `source` path, bounds sidecar for JPEG/PNG, display `unit`, `velocityRange` if dataset-independent).

**What to do:** Open the reference for the **Map SDK from Step 1**. Wire `ParticleMotion` with the processed wind file and bounds; add the layer to the map.

| Step 1 SDK | Reference |
|------------|-----------|
| Mapbox GL JS | [add-wind-particle-mapbox.md](references/add-wind-particle-mapbox.md) |
| MapLibre GL JS | [add-wind-particle-maplibre.md](references/add-wind-particle-maplibre.md) |

**TypeScript projects:** If the project uses TypeScript (e.g. `.ts`/`.tsx` files, `tsconfig.json`), apply the `as unknown as CustomLayerInterface` cast on every `map.addLayer(particleLayer …)` call — the cast is shown in the reference above. Do **not** use it in plain JavaScript projects.

**Once the code builds successfully**, do not attempt to open or check the browser yourself. Instead, tell the user to run `npm run dev` and verify the result in their own browser. Browser automation in this context is unreliable and unnecessary — the user is best placed to confirm the layer renders correctly.

If the user requests to fine-tune particle appearance or behavior (`particleCount`, `velocityFactor`, `updateInterval`, `trailLength`, GeoTIFF band indices, etc.), see [particle_motion_layer_options.md](references/particle_motion_layer_options.md).

---
