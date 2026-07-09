# Install pipeline dependencies

Run this **before** Step 4 preprocessing when Python pipeline scripts or GDAL are needed.

## 1. Tell the user what is required

| Tool / package | Needed for |
|----------------|------------|
| **GDAL** (`gdalwarp`, `gdalinfo`; Python `osgeo` for pipeline scripts) | All Step 4 paths |
| `numpy`, `Pillow` | JPEG/PNG image pipeline scripts |
| `piexif` | Dataset-dependent JPEG path (`grib2_to_image.py`) only |
| `libgdal-grib` | GRIB/GRIB2 file support in GDAL |

**Explain this list to the user** before installing. GeoTIFF-only preprocessing uses GDAL command-line tools; JPEG/PNG paths also need the Python packages above.

## 2. Ask which environment to use

> Preprocessing needs GDAL and (for JPEG/PNG output) Python packages. Do you prefer **Conda** or a **Python virtual environment** for installing them?

Use the environment they name. If they have **no preference**, create a **Python virtual environment** (see below).

## 3. Install — Conda

Use an existing Conda env or create one:

```bash
conda create -n wind-pipeline -c conda-forge gdal libgdal-grib numpy pillow piexif
conda activate wind-pipeline
```

Omit `piexif` if Step 3 did not choose the dataset-dependent JPEG path.

## 4. Install — Python venv (or no preference)

```bash
python3 -m venv .venv-wind-pipeline
source .venv-wind-pipeline/bin/activate
```

Windows: `.venv-wind-pipeline\Scripts\activate`

```bash
pip install numpy pillow piexif libgdal-grib
```

Omit `piexif` if not using the EXIF JPEG path.

GDAL Python bindings (`osgeo`) often install most reliably via **Conda**. If `pip install gdal` fails in `venv`, **tell the user** and recommend Conda (`conda install -c conda-forge gdal libgdal-grib`) or a system GDAL build with Python bindings.

## 5. Verify

```bash
gdalwarp --version
python -c "from osgeo import gdal; import numpy; from PIL import Image"
```

Add `import piexif` when using the dataset-dependent JPEG path. To confirm GRIB support is active:

```bash
python -c "from osgeo import gdal; drivers = [gdal.GetDriver(i).ShortName for i in range(gdal.GetDriverCount())]; print('GRIB' in drivers)"
```

Run all Step 4 `python pipeline/...` commands with this environment activated.
