"""Convert a GRIB2 scalar band to an RGB image with fixed-range normalization (no EXIF)."""

import argparse
import os
import sys

import numpy as np
from osgeo import gdal, osr
from PIL import Image

gdal.UseExceptions()


def build_nodata_mask(band_data, nodata_value, existing_mask=None):
    """Return a boolean mask where True marks NoData pixels."""
    mask = existing_mask.copy() if existing_mask is not None else np.zeros(band_data.shape, dtype=bool)
    if nodata_value is not None:
        mask |= band_data == nodata_value
    return mask


def normalize_fixed_range(arr, min_value, max_value, nodata_mask):
    """Normalize array to 0-255 using fixed min/max; NoData pixels stay 0."""
    normalized = np.zeros(arr.shape, dtype=np.uint8)
    if max_value == min_value:
        return normalized

    valid = ~nodata_mask
    if not np.any(valid):
        return normalized

    scaled = (arr - min_value) * 255.0 / (max_value - min_value)
    np.clip(scaled, 0, 255, out=scaled)
    normalized[valid] = np.rint(scaled[valid]).astype(np.uint8)
    return normalized


def build_scalar_mask_band(nodata_mask):
    """SmoothRaster NA mask: 255 = NA, 0 = valid."""
    mask_band = np.zeros(nodata_mask.shape, dtype=np.uint8)
    mask_band[nodata_mask] = 255
    return mask_band


def build_image_array(scalar_norm, nodata_mask):
    """Stack scalar band with NA mask in B (RGB)."""
    g_band = np.zeros(scalar_norm.shape, dtype=np.uint8)
    mask_band = build_scalar_mask_band(nodata_mask)
    return np.stack([scalar_norm, g_band, mask_band], axis=2), 'RGB'


def find_band_by_attribute(ds, attribute_str):
    """Find band index by matching metadata attribute."""
    if not attribute_str or '=' not in attribute_str:
        return None

    key, value = attribute_str.split('=', 1)

    for i in range(1, ds.RasterCount + 1):
        band = ds.GetRasterBand(i)
        metadata = band.GetMetadata()
        if metadata.get(key) == value:
            return i

    return None


def get_band_index(ds, band_spec):
    """Resolve a band spec (1-based index or KEY=VALUE attribute) to a band index."""
    if isinstance(band_spec, int):
        band_idx = band_spec
    elif isinstance(band_spec, str):
        band_idx = find_band_by_attribute(ds, band_spec)
        if band_idx is None:
            raise ValueError(f'Could not find band matching attribute: {band_spec}')
    else:
        raise ValueError(f'Invalid band specification type: {type(band_spec)}')

    if band_idx < 1 or band_idx > ds.RasterCount:
        raise ValueError(f'Band {band_idx} is out of range (1-{ds.RasterCount})')
    return band_idx


def parse_band_spec(value):
    """Parse CLI band argument as integer index or KEY=VALUE attribute string."""
    if '=' in value:
        return value
    try:
        return int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"Band must be a 1-based integer or KEY=VALUE attribute string, got: {value!r}"
        ) from exc


def is_epsg4326(ds):
    """Return True when the dataset CRS matches EPSG:4326."""
    wkt = ds.GetProjection()
    if not wkt:
        return False

    src_srs = osr.SpatialReference()
    if src_srs.ImportFromWkt(wkt) != 0:
        return False
    src_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)

    dst_srs = osr.SpatialReference()
    dst_srs.ImportFromEPSG(4326)
    dst_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    return src_srs.IsSame(dst_srs)


def open_in_epsg4326(input_path):
    """Open a dataset, reprojecting to EPSG:4326 in memory when needed."""
    ds = gdal.Open(input_path)
    if ds is None:
        raise RuntimeError(f'Could not open {input_path}')

    if is_epsg4326(ds):
        return ds

    dst_nodata = ds.GetRasterBand(1).GetNoDataValue()
    if dst_nodata is None:
        dst_nodata = -9999

    warped = gdal.Warp(
        '',
        ds,
        format='MEM',
        dstSRS='EPSG:4326',
        dstNodata=dst_nodata,
    )
    ds = None
    if warped is None:
        raise RuntimeError(f'Failed to reproject {input_path} to EPSG:4326')
    return warped


def image_format_from_path(output_file):
    ext = os.path.splitext(output_file)[1].lower()
    if ext in ('.jpg', '.jpeg'):
        return 'JPEG'
    if ext == '.png':
        return 'PNG'
    raise ValueError(f"Unsupported output extension '{ext}'. Use .jpg, .jpeg, or .png.")


def process_grib_scalar(
    input_file,
    output_file,
    scalar_band,
    min_value,
    max_value,
):
    ds = open_in_epsg4326(input_file)

    scalar_band_idx = get_band_index(ds, scalar_band)

    scalar_raster = ds.GetRasterBand(scalar_band_idx)
    scalar_data = scalar_raster.ReadAsArray().astype(np.float64)
    nodata_mask = build_nodata_mask(scalar_data, scalar_raster.GetNoDataValue())

    scalar_norm = normalize_fixed_range(scalar_data, min_value, max_value, nodata_mask)

    output_format = image_format_from_path(output_file)
    array, mode = build_image_array(scalar_norm, nodata_mask)
    image = Image.fromarray(array, mode)

    os.makedirs(os.path.dirname(os.path.abspath(output_file)) or '.', exist_ok=True)

    save_kwargs = {'optimize': True}
    if output_format == 'JPEG':
        save_kwargs['quality'] = 95

    image.save(output_file, output_format, **save_kwargs)
    ds = None


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description=(
            'Read a scalar band from a GRIB2 file, reproject to EPSG:4326 if needed, '
            'normalize to 0-255 using fixed min/max, and write an image '
            '(R=scalar, G=0, NA mask in B). No EXIF is written.'
        )
    )
    parser.add_argument('input_grib2', help='Input GRIB2 file path')
    parser.add_argument('output_file', help='Output image path (.jpg, .jpeg, or .png)')
    parser.add_argument(
        '--scalar-band',
        type=parse_band_spec,
        default=1,
        dest='scalar_band',
        help='Scalar band: 1-based index or KEY=VALUE attribute (default: 1)',
    )
    parser.add_argument(
        '--min-value',
        type=float,
        required=True,
        dest='min_value',
        help='Fixed min for normalization (required)',
    )
    parser.add_argument(
        '--max-value',
        type=float,
        required=True,
        dest='max_value',
        help='Fixed max for normalization (required)',
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv or sys.argv[1:])

    if args.max_value == args.min_value:
        print('Error: maxValue must differ from minValue', file=sys.stderr)
        sys.exit(1)

    try:
        process_grib_scalar(
            args.input_grib2,
            args.output_file,
            scalar_band=args.scalar_band,
            min_value=args.min_value,
            max_value=args.max_value,
        )
    except Exception as exc:
        print(f'Error processing file: {exc}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
