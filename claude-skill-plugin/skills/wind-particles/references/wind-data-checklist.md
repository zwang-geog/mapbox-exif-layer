# Wind data source checklist

Work through each section when validating raw wind data for `ParticleMotion`. Combine **asking the user** (workflow and product intent) with **investigating yourself** (file metadata, provider docs, tooling). Do not treat technical details as interview questions — users often do not know band indices, velocity units, or GRIB keys.

## A. Data origin — *ask user*

Establish how wind grids enter the project:

- Do they **generate** forecasts (internal model, WRF, etc.)?
- Do they **download** ready-made forecasts (NOAA NAM/GFS, ECMWF, Copernicus, etc.)?
- Do they need **help finding** a public source? (If yes, research options; verify access terms.)

If a sample file or data path already exists in the project, note it and move to investigation.

## B. Time dimension — *ask user*

- **Single** forecast time, or **multi-timestep** (time slider / animation across many hours)?
- If multi-timestep: approximate count and interval (e.g. hourly × 48 h). Many timesteps strongly favor JPEG/PNG in Step 3.

If multiple files are already present, **investigate** the naming pattern or directory listing to infer timesteps; confirm with the user only if ambiguous.

## C. Raster suitability — *investigate* (confirm with user only if blocked)

Inspect the dataset (or provider documentation if no file yet). Use tools such as `gdalinfo`, `gdalinfo -json`, or equivalent — not user memory.

| Check | What to determine |
|-------|-------------------|
| **Format** | GDAL-readable raster (GRIB2, NetCDF, GeoTIFF, etc.). **Not** vector (GeoJSON arrows) — `ParticleMotion` needs a **raster grid**. |
| **u and v components** | Two separate bands/variables with u- and v-component velocity — not speed/direction only. Record **band indices** or GRIB keys (e.g. `UGRD` / `VGRD`). If only speed/direction exists, plan conversion to u/v or flag as unsuitable. |
| **Dataset velocity unit** | **Investigate:** unit stored in the file (**m/s**, **mph**, or **km/h**). Read from GRIB/NetCDF metadata or provider docs. **Tell the user** what you found; ask only if metadata is missing or ambiguous. |
| **Display velocity unit** | **Ask the user:** which unit they want on the map for particle speed and legends (**m/s**, **mph**, or **km/h** — maps to layer `unit`: `mps`, `mph`, `kph`). If it differs from the dataset unit, note that conversion is needed in preprocessing or layer setup. |
| **CRS** | Record the dataset’s CRS / projection from metadata (reprojection is handled in a later step). |

## D. Blockers — *report, then ask if needed*

If investigation fails (no file, opaque format, speed/direction only), explain what is missing and ask the user for a sample file, documentation link, or provider name.
