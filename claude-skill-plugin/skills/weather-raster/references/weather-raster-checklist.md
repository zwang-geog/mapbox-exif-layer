# Weather raster data source checklist

Work through each section when validating raw scalar weather data for `SmoothRaster`. Combine **asking the user** (workflow and product intent) with **investigating yourself** (file metadata, provider docs, tooling). Do not treat technical details as interview questions — users often do not know band indices, physical units, or GRIB keys.

## A. Data origin — *ask user*

Establish how weather grids enter the project:

- Do they **generate** forecasts (internal model, WRF, etc.)?
- Do they **download** ready-made forecasts (NOAA NAM/GFS, ECMWF, Copernicus, etc.)?
- Do they need **help finding** a public source? (If yes, offer the GFS JPEGs below, then research other options if those do not fit; verify access terms.)
- Which **weather variable(s)** should be mapped? Confirm with the user (e.g. temperature, relative humidity, precipitation, wind speed). Each variable is typically one `SmoothRaster` layer.

**Ready-made option:** global GFS 0.25° EXIF JPEGs published for this package. Free for public use, including commercial use, with attribution to NOAA and mapbox-exif-layer. Temperature and relative humidity are the scalar fields here.

| | |
| --- | --- |
| Temperature URL | `https://www.mapbox-exif-layer.com/gfs/0p25/temperature/temperature_{YYYYMMDDHH}.jpeg` (`HH` is 00–23 UTC). 2 m TMP only, in °C. |
| Relative humidity URL | `https://www.mapbox-exif-layer.com/gfs/0p25/rh/rh_{YYYYMMDDHH}.jpeg`. 2 m RH only, in %. |
| Bounds | `[-180, 90, 180, -90]` |
| Which times exist | `https://www.mapbox-exif-layer.com/gfs/0p25/status.json` |

These files are already scalar JPEGs with EXIF min/max. If the user chooses them, record the URL, bounds, and unit (°C or %), and skip raw-format investigation and preprocessing. `color` stops must use that unit. Precipitation is not in this set. Wind under the same base URL (`wind/`) is u/v flow for the wind-particles skill, not a `SmoothRaster` layer.

If a sample file or data path already exists in the project, note it and move to investigation.

## B. Time dimension — *ask user*

- **Single** forecast time, or **multi-timestep** (time slider / animation across many hours)?
- If multi-timestep: approximate count and interval (e.g. hourly × 48 h). Many timesteps strongly favor JPEG/PNG in Step 3.

If multiple files are already present, **investigate** the naming pattern or directory listing to infer timesteps; confirm with the user only if ambiguous.

## C. Raster suitability — *investigate* (confirm with user only if blocked)

Inspect the dataset (or provider documentation if no file yet). Use tools such as `gdalinfo`, `gdalinfo -json`, or equivalent — not user memory.

| Check | What to determine |
|-------|-------------------|
| **Format** | GDAL-readable raster (GRIB2, NetCDF, GeoTIFF, etc.). **Not** vector (contours, station points) — `SmoothRaster` needs a **regular raster grid**. |
| **Scalar field** | One band/variable per layer (e.g. temperature, relative humidity, precipitation, wind speed). Record **band index** or GRIB key (e.g. `TMP`, `RH`, `APCP01`). If the file holds multiple variables, identify which band maps to each field the user wants. For **wind**, `SmoothRaster` can map **wind speed** as a scalar — derived from u- and v-component velocity when the source provides u/v bands. For animated wind **direction** or flow, use the wind-particles skill (`ParticleMotion`) instead. |
| **Dataset physical unit** | **Investigate:** unit stored in the file (e.g. **°C** / **K** for temperature, **%** for relative humidity, **mm** / **kg/m²** for precipitation). Read from GRIB/NetCDF metadata or provider docs. **Tell the user** what you found; ask only if metadata is missing or ambiguous. |
| **Display physical unit** | **Ask the user:** which unit they want on the map for the colormap and legend (e.g. **°C** vs **°F**, **mm** vs **in**). `color` stop values must use this unit. If it differs from the dataset unit, note that conversion is needed in preprocessing or layer setup. |
| **CRS** | Record the dataset’s CRS / projection from metadata (reprojection is handled in a later step). |

## D. Blockers — *report, then ask if needed*

If investigation fails (no file, opaque format, vector-only data, wrong variable type), explain what is missing and ask the user for a sample file, documentation link, or provider name.
