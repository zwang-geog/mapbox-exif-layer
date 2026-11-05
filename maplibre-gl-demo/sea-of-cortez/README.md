# Sea of Cortez wind forecast

A focused nautical-style regional demo built with the existing MapLibre GL JS/WebGL architecture and `mapbox-exif-layer`'s GPU-accelerated `NewParticleMotion` layer. It does not replace the global GFS demo or the package's existing wind implementation.

## Run

```bash
npm install
npm run update:goes
npm run dev
```

For automatic GOES refresh while the app is running, start `npm run watch:goes` in a second terminal. The processor writes a small regional PNG and manifest into `public/goes`; the browser polls that manifest every three minutes. A static deployment should run the processor before publishing, then redeploy the updated cache files. The browser does not download or decode source NetCDF granules.

## Data and rendering

- Wind uses NOAA GFS 0.25° 10 m UGRD/VGRD components in metres per second from the documented `mapbox-exif-layer` JPEG endpoint. The app reads `status.json` at runtime to build hourly and 3-hourly forecast steps; initialization and valid times are displayed in UTC.
- Wind particles are rendered as a MapLibre custom WebGL layer. The map uses the OpenFreeMap dark style with a deep navy water color, muted slate land, and a low-contrast GEBCO WMS shaded-relief layer beneath the wind.
- Basemap text labels are hidden for an uncluttered wind-focused view. A restrained coastline stroke preserves the geographic silhouette without place or water names.
- This demo imports `NewParticleMotion` from the repository source so renderer refinements are visible here. Its GPU velocity texture already uses linear filtering for bilinear spatial sampling; particle tails are softly tapered, while forecast steps remain actual NOAA frames rather than interpolated or synthesized data.
- A clipped Natural Earth 1:10m land polygon mask is rasterized to the GFS grid and applied to the particle texture's no-data channel, which clips particles at land cells. The map also redraws the coastline above the animation. This regional mask covers the Sea of Cortez view; map bounds keep the display in that covered area.
- The optional wind readout distinguishes an exact requested water-cell match, a nearby water cell, a nearby offshore cell for a non-water request (such as land), and no eligible sample. Nearby readings are labeled in the UI with their distance; requested and selected coordinates, distance, GEBCO class, and any supplied GFS land fraction are logged to developer tools. The 20 km radius is only a maximum search boundary, not a guarantee of representative local data. This readout is independent of the full wind field used by the particle renderer.
- GEBCO's categorical mask is used only for the local readout, not to change or disable the particle field. Its grayscale classes are 255 for definite water (elevation at or below -10 m), 128 for uncertain coast (-10 m to 0 m), 0 for land (0 m or higher), and 64 for NoData. Only class 255 is accepted as local water; mask lookups use nearest-cell sampling and never interpolate class values.
- The processed `mapbox-exif-layer` GFS JPEG does not include the native GFS land-sea mask. The sampler accepts a same-grid native mask when one is available and cross-checks it against GEBCO; this demo explicitly falls back to GEBCO alone rather than silently using a time-mismatched model mask.
- If the GFS catalog or selected image cannot load, the app switches to an explicitly labelled synthetic demonstration field. It is not presented as forecast or observed weather.
- GOES-18 ABI imagery is processed by a separate Python worker. It discovers recent `ABI-L2-MCMIPF` objects from NOAA's public AWS S3 listing, inspects the product's timestamps/calibration/projection metadata, and reads only the needed regional data windows using GDAL's HTTP range support. It does not download full-disk NetCDF into the browser.
- Daylight cloud texture uses calibrated ABI reflectance from C02/C03/C01 (red/green/blue) with the per-channel data-quality flags. At night and twilight, ABI C13 10.3 µm calibrated brightness temperature provides soft cold-cloud contrast against a warmer clear-surface threshold. CMI variables use their product scale/offset metadata; DQF 0 and 1 are retained, and fill/no-data or lower-quality pixels remain transparent. Clear warm ocean pixels are transparent, and the cloud texture uses a restrained neutral blue-white palette with capped alpha, composited independently above the ocean and below the wind. Cloud alpha is a soft visual treatment, not a certified cloud mask.
- ABI `x`/`y` fixed-grid scan-angle offsets and increments, satellite height, projection origin, ellipsoid and sweep axis are read from each NetCDF product. Pixels are georeferenced from the GOES geostationary projection and reprojected to EPSG:3857 over the Sea of Cortez bounds before rendering as a MapLibre image source. It is not stretched from a full-disk rectangular image.
- Each processed observation keeps its true acquisition start/end, download and processing timestamps, source identity, calibration/projection summary and image coordinates. The cache retains the three latest processed observations. On a new observation, the app cross-fades opacity between the two real images; it does not fabricate cloud movement or label an interpolation as a new observation.
- If an update fails, the worker leaves the last successful manifest and image intact, while the browser keeps its loaded image and logs its age/update status. Attribution identifies “Satellite imagery: NOAA GOES-18 ABI.” A dedicated cloud-mask product is not currently consumed; cold-cloud contrast and visible-band brightness/whiteness are used instead.

## Building the GEBCO mask

The original GEBCO GeoTIFF is read-only input. Build the separately derived mask from the supplied regional raster with Python packages `rasterio`, `numpy`, and `Pillow`:

```bash
python3 -m pip install rasterio numpy Pillow
python3 scripts/build_gebco_mask.py "/path/to/gebco_2026_n30.0_s22.0_w-115.0_e-108.0_geotiff.tif"
```

The script verifies the input CRS and north-up geographic transform, writes `public/gebco-classification.png` and its georeferencing/classification metadata JSON, and leaves the source raster unchanged. The default water threshold is -10 m; change it with `--threshold-meters`, which must remain below zero. The generated PNG is categorical; do not resize, bilinearly filter, or otherwise interpolate it.

## GOES-18 cloud cache

The regional worker uses rasterio/GDAL with HDF5 support, PyProj, NumPy, Pillow and Certifi. Install the processing requirements and update the cache once with:

```bash
python3 -m pip install -r scripts/requirements-goes.txt
npm run update:goes
```

Use `npm run watch:goes` to keep polling NOAA in a separate process, or `npm run test:goes` for the pipeline unit tests. GOES MCMIPF full-disk granules are large, but the worker's HDF5 range reads only fetch source chunks needed for the regional crop; only the compressed regional PNGs are kept in the app cache.

## Attribution and limitations

Credit NOAA/NCEI for GFS and GOES-18 ABI imagery, mapbox-exif-layer for processed wind imagery and particle rendering, GEBCO for bathymetry and the derived geographic cross-check, Natural Earth for the particle land mask, and OpenFreeMap/MapLibre for the basemap and renderer. GEBCO's regional grid is public domain subject to its conditions of use and disclaimer; its source DOI is `10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa`. The map's attribution control links the data providers.

This is an atmospheric forecast visualization, not an observed-condition product or a certified weather or navigation instrument. GEBCO is a global bathymetry grid and coastline mask is a cartographic overlay, not a nautical chart.
