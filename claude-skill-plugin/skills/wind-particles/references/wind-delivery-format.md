# Wind delivery format: JPEG/PNG vs GeoTIFF

Both paths use the same `ParticleMotion` layer; only the **source file** and **preprocessing** differ.

**Explain Options A and B to the user** and **ask them to choose** one. Use the sections below as talking points.

## Option A — JPEG or PNG (recommended for most web wind maps)

| | |
|--|--|
| **Strengths** | **Small files** — e.g. NOAA NAM NEST CONUS (~2269×976) wind ≈ **332 KB JPEG** vs ≈ **8.9 MB** ZSTD float32 GeoTIFF. Lower **storage and transfer** cost; faster browser load. Ideal for **large areas** and **many forecast timestamps**. |
| **Tradeoffs** | Requires **normalization** of u/v to 0–255 before encoding. Slight **precision loss** — usually fine for consumer-grade wind visualization. |

If the user chooses JPEG/PNG, **explain to them** how min/max for normalization is defined and **ask them** to pick a sub-path:

### A1. Dataset-independent

**Tell the user:** use a **typical physical range** they care about (e.g. u/v wind components in −50 to 50 m/s), **regardless of this timestep's actual extremes**. Same range across timesteps and datasets; good when they want **stable physical meaning** — the same encoded value always represents the same velocity everywhere.

**Wind delivery format: JPEG or PNG** — Ask the user which they prefer if not already clear

### A2. Dataset-dependent *(recommended)*

**Tell the user:** normalize using **each dataset's actual min and max**. Good when physical meaning can vary per file: each timestep is stretched to its own range, which helps show detail when winds are weak or capture extremes when they exceed typical bounds. **This is the recommended sub-path** — it adapts to each dataset automatically and produces better visual results across diverse wind conditions.

**Wind delivery format: JPEG only** — Tell the user the format is JPEG; do not offer PNG for this sub-path.

**Ask the user** which sub-path fits their product: **per-dataset scaling (A2, recommended)** vs **fixed physical scale across all data (A1)**. Then confirm the output format (**JPEG or PNG** for A1; **JPEG** for A2). Do not dive into band encoding or implementation details here.

## Option B — GeoTIFF (float32)

| | |
|--|--|
| **Strengths** | **Less preprocessing** — physical u/v values go straight to the GPU. **Higher precision** than 8-bit JPEG. Familiar GIS workflow. |
| **Tradeoffs** | **Much larger** files → higher hosting and bandwidth cost; layer **downloads the whole file** in the browser (no COG tiling). Best for **single timesteps** or small area. |
