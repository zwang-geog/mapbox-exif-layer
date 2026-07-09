# Privacy Policy

**Last updated:** July 2026

## No Data Collection

The `wind-weather-map-layers` Claude Code plugin consists entirely of skill instruction files (Markdown). It contains no executables, no scripts, and no MCP servers.

The plugin itself:

- Collects no personal data
- Stores nothing on your device beyond the skill files installed by Claude Code
- Does not transmit any information to the plugin author or any third party

## Pipeline Script Downloads

During the data preprocessing steps (Step 4), the skills instruct Claude Code to download Python pipeline scripts from the plugin author's public GitHub repository using `curl`:

- `https://raw.githubusercontent.com/zwang-geog/mapbox-exif-layer/main/pipeline/grib2_uv_to_image_with_fix_min_max.py`
- `https://raw.githubusercontent.com/zwang-geog/mapbox-exif-layer/main/pipeline/grib2_to_image.py`
- `https://raw.githubusercontent.com/zwang-geog/mapbox-exif-layer/main/pipeline/grib2_scalar_to_image_with_fix_min_max.py`

These requests are made from **your machine** to GitHub's servers and are subject to [GitHub's Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). The plugin author receives no information from these requests beyond what GitHub's standard access logs may record (e.g. IP address, timestamp). The scripts are open source and can be reviewed at the repository linked above before running them.

## What the Skills Do

When activated, the skills guide Claude Code through tasks such as preprocessing geospatial wind and weather data and writing map layer code. All work happens locally in your development environment using tools you already have installed (Python, GDAL, npm, etc.). The plugin author has no visibility into your usage.

## Third-Party Tools

The skills may instruct Claude Code to run commands using third-party tools (e.g. GDAL, Python packages, Mapbox GL JS, MapLibre GL JS). Those tools have their own privacy policies and terms of use, which are independent of this plugin.

## Contact

For questions, open an issue at [https://github.com/zwang-geog/mapbox-exif-layer](https://github.com/zwang-geog/mapbox-exif-layer).
