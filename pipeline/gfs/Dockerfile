# GFS 10 m wind JPEG pipeline
#
# From repo root:
#   docker build -f pipeline/gfs/Dockerfile -t gfs-wind-pipeline .
#
# Run:
#   docker run --rm \
#     -e GFS_WIND_S3_BUCKET=your-bucket \
#     -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
#     gfs-wind-pipeline
#   docker run --rm -e GFS_WIND_S3_BUCKET=your-bucket gfs-wind-pipeline 20261001 00
#
# Convert only:
#   docker run --rm -v "$PWD/gfs_wind_out:/out" -e GFS_WIND_OUT_DIR=/out \
#     gfs-wind-pipeline --skip-s3 20261001 00 000

FROM ghcr.io/osgeo/gdal:ubuntu-small-3.12.4

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHON=/opt/venv/bin/python \
    PATH="/opt/venv/bin:${PATH}"

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        python3-venv \
        unzip \
    && rm -rf /var/lib/apt/lists/*

ARG TARGETARCH
RUN case "${TARGETARCH}" in \
      amd64) AWS_ARCH=x86_64 ;; \
      arm64) AWS_ARCH=aarch64 ;; \
      *) echo "unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${AWS_ARCH}.zip" -o /tmp/awscliv2.zip \
    && unzip -q /tmp/awscliv2.zip -d /tmp \
    && /tmp/aws/install \
    && rm -rf /tmp/aws /tmp/awscliv2.zip \
    && aws --version

WORKDIR /opt/gfs

COPY pipeline/gfs/requirements.txt /opt/gfs/pipeline/gfs/requirements.txt

RUN python3 -m venv --system-site-packages /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -U pip \
    && /opt/venv/bin/pip install --no-cache-dir -r /opt/gfs/pipeline/gfs/requirements.txt

COPY pipeline/grib2_to_image.py /opt/gfs/pipeline/grib2_to_image.py
COPY pipeline/gfs/jpeg_gfs.json /opt/gfs/pipeline/gfs/jpeg_gfs.json
COPY pipeline/gfs/jpeg_gfs_wind.json /opt/gfs/pipeline/gfs/jpeg_gfs_wind.json
COPY pipeline/gfs/run_gfs.py /opt/gfs/pipeline/gfs/run_gfs.py

RUN chmod +x /opt/gfs/pipeline/gfs/run_gfs.py \
    && /opt/venv/bin/python -c "from osgeo import gdal; import numpy, PIL, piexif; assert 'GRIB' in [gdal.GetDriver(i).ShortName for i in range(gdal.GetDriverCount())]"

ENTRYPOINT ["/opt/venv/bin/python", "/opt/gfs/pipeline/gfs/run_gfs.py"]
