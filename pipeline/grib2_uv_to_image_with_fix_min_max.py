"""Convert GRIB2 u/v wind bands to an RGB image with fixed-range normalization (no EXIF)."""

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


def build_valid_mask_band(nodata_mask):
    """Valid mask: 0 = NoData, 255 = valid."""
    mask_band = np.zeros(nodata_mask.shape, dtype=np.uint8)
    mask_band[~nodata_mask] = 255
    return mask_band


def build_image_array(u_norm, v_norm, nodata_mask, mask_in_alpha=False):
    """Stack u/v bands with NA mask in B (RGB) or A (RGBA)."""
    mask_band = build_valid_mask_band(nodata_mask)
    if mask_in_alpha:
        b_band = np.zeros(nodata_mask.shape, dtype=np.uint8)
        return np.stack([u_norm, v_norm, b_band, mask_band], axis=2), 'RGBA'
    return np.stack([u_norm, v_norm, mask_band], axis=2), 'RGB'


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


def process_grib_uv(
    input_file,
    output_file,
    u_band=1,
    v_band=2,
    min_value=-64.0,
    max_value=64.0,
    mask_in_alpha=False,
):
    ds = open_in_epsg4326(input_file)

    if u_band < 1 or u_band > ds.RasterCount:
        raise ValueError(f"uBand {u_band} is out of range (1-{ds.RasterCount})")
    if v_band < 1 or v_band > ds.RasterCount:
        raise ValueError(f"vBand {v_band} is out of range (1-{ds.RasterCount})")

    u_raster = ds.GetRasterBand(u_band)
    v_raster = ds.GetRasterBand(v_band)

    u_data = u_raster.ReadAsArray().astype(np.float64)
    v_data = v_raster.ReadAsArray().astype(np.float64)

    nodata_mask = build_nodata_mask(u_data, u_raster.GetNoDataValue())
    nodata_mask = build_nodata_mask(v_data, v_raster.GetNoDataValue(), nodata_mask)

    u_norm = normalize_fixed_range(u_data, min_value, max_value, nodata_mask)
    v_norm = normalize_fixed_range(v_data, min_value, max_value, nodata_mask)

    output_format = image_format_from_path(output_file)
    if mask_in_alpha and output_format == 'JPEG':
        raise ValueError('mask-in-alpha requires PNG output (JPEG does not support alpha).')

    array, mode = build_image_array(u_norm, v_norm, nodata_mask, mask_in_alpha)
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
            'Read u/v bands from a GRIB2 file, reproject to EPSG:4326 if needed, '
            'normalize to 0-255 using fixed min/max, and write an image '
            '(R=u, G=v, NA mask in B by default). No EXIF is written.'
        )
    )
    parser.add_argument('input_grib2', help='Input GRIB2 file path')
    parser.add_argument('output_file', help='Output image path (.jpg, .jpeg, or .png)')
    parser.add_argument('--u-band', type=int, default=1, dest='u_band', help='U band index (1-based, default: 1)')
    parser.add_argument('--v-band', type=int, default=2, dest='v_band', help='V band index (1-based, default: 2)')
    parser.add_argument('--min-value', type=float, default=-64.0, dest='min_value', help='Fixed min for normalization (default: -64)')
    parser.add_argument('--max-value', type=float, default=64.0, dest='max_value', help='Fixed max for normalization (default: 64)')
    parser.add_argument(
        '--mask-in-alpha',
        action='store_true',
        dest='mask_in_alpha',
        help='Write NA mask to A band (RGBA PNG) instead of B band (RGB). Requires .png output.',
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv or sys.argv[1:])

    if args.max_value == args.min_value:
        print('Error: maxValue must differ from minValue', file=sys.stderr)
        sys.exit(1)

    try:
        process_grib_uv(
            args.input_grib2,
            args.output_file,
            u_band=args.u_band,
            v_band=args.v_band,
            min_value=args.min_value,
            max_value=args.max_value,
            mask_in_alpha=args.mask_in_alpha,
        )
    except Exception as exc:
        print(f'Error processing file: {exc}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
