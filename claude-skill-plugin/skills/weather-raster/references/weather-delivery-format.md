# Weather raster delivery format: JPEG/PNG vs GeoTIFF

Both paths use the same `SmoothRaster` layer; only the **source file** and **preprocessing** differ.

**Explain Options A and B to the user** and **ask them to choose** one. Use the sections below as talking points.

## Option A — JPEG or PNG (recommended for most web weather maps)

| | |
|--|--|
| **Strengths** | **Small files** — e.g. NOAA NAM NEST CONUS (~2269×976) temperature ≈ **245 KB JPEG** vs ≈ **3.7 MB** ZSTD float32 GeoTIFF. Lower **storage and transfer** cost; faster browser load. Ideal for **large areas** and **many forecast timestamps**. |
| **Tradeoffs** | Requires **normalization** of the scalar field to 0–255 before encoding. Slight **precision loss** — usually fine for consumer-grade weather visualization. **One image per variable per timestep** (temperature, RH, and precipitation each get their own file). |

If the user chooses JPEG/PNG, **explain to them** how min/max for normalization is defined and **ask them** to pick a sub-path:

### A1. Dataset-independent

**Tell the user:** use a **typical physical range** they care about (e.g. temperature −20 to 45 °C, relative humidity 0–100 %, precipitation 0–50 mm), **regardless of this timestep’s actual extremes**. Same range across timesteps and datasets; good when they want **stable physical meaning** — the same encoded value always represents the same quantity everywhere.

**Delivery format: JPEG or PNG** — Ask the user which they prefer if not already clear.

### A2. Dataset-dependent

**Tell the user:** normalize using **each dataset’s actual min and max**. Good when physical meaning can vary per file: each timestep is stretched to its own range, which helps show detail when values are weak or capture extremes when they exceed typical bounds.

**Delivery format: JPEG only** — Tell the user the format is JPEG; do not offer PNG for this sub-path.

**Ask the user** which sub-path fits their product: **fixed physical scale across all data** vs **per-dataset scaling**. Then confirm the output format (**JPEG or PNG** for A1; **JPEG** for A2). Do not dive into band encoding or implementation details here.

## Option B — GeoTIFF (float32)

| | |
|--|--|
| **Strengths** | **Less preprocessing** — physical scalar values go straight to the GPU. **Higher precision** than 8-bit JPEG. Familiar GIS workflow. Can hold **multiple weather variables as separate bands** in one file. |
| **Tradeoffs** | **Much larger** files → higher hosting and bandwidth cost; each layer **downloads the whole GeoTIFF** in the browser (no COG tiling). `SmoothRaster` on GeoTIFF looks **blockier** than JPEG at native resolution (nearest sampling). Best for **single timesteps**, small areas, or quick previews. |

If the user chooses GeoTIFF and maps **more than one variable**, **explain the packaging options** and **ask which they prefer**:

### B1. Multi-band — one GeoTIFF per timestep

**Tell the user:** stack each weather variable as a **separate band** in the same file (e.g. first band = temperature, second band = relative humidity, third band = precipitation). The first layer that references this file triggers **one network download**; subsequent layers pointing to the same URL are served from the **browser cache**. Good when users often **display several variables together** from the same forecast time.

**Tradeoff:** the browser downloads the **entire multi-band file** even if the user only turns on one layer.

### B2. Single-band — one GeoTIFF per variable per timestep

**Tell the user:** export **one GeoTIFF per weather variable** (e.g. `temperature.tif`, `rh.tif`). Each `SmoothRaster` layer points at its own file. If all layers are added in `style.load`, all files are downloaded at map load regardless of which variables are toggled on — the same behavior as multi-band. The file-per-variable advantage is **smaller individual downloads** and the option to **defer `addLayer`** to after the user first enables a variable, skipping that download entirely until needed.

**Tradeoff:** more files to manage per timestep; deferred `addLayer` requires a more complex app architecture.

**Ask the user** which fits their product: **batch variables in one file** (`geotiff-multi-band`) vs **one file per variable on demand** (`geotiff-single-band`). For a **single variable** only, either packaging works — single-band is simpler.
