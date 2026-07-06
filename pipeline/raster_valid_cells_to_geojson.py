"""Polygonize valid raster cells from a GRIB2 or GeoTIFF band into GeoJSON."""

import argparse
import json
import os
import sys

import numpy as np
from osgeo import gdal, ogr, osr

gdal.UseExceptions()


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


def reproject_to_epsg4326(ds, band_idx):
    """Reproject a dataset to EPSG:4326 in memory when needed."""
    if is_epsg4326(ds):
        return ds

    dst_nodata = ds.GetRasterBand(band_idx).GetNoDataValue()
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
        raise RuntimeError('Failed to reproject dataset to EPSG:4326')
    return warped


def build_nodata_mask(band_data, nodata_value):
    """Return a boolean mask where True marks NoData pixels."""
    mask = np.zeros(band_data.shape, dtype=bool)
    if nodata_value is not None:
        mask |= band_data == nodata_value
    if np.issubdtype(band_data.dtype, np.floating):
        mask |= np.isnan(band_data)
    return mask


def polygonize_valid_cells(ds, band_idx):
    """Return a GeoJSON FeatureCollection for connected valid-cell regions."""
    raster_band = ds.GetRasterBand(band_idx)
    band_data = raster_band.ReadAsArray()
    nodata_mask = build_nodata_mask(band_data, raster_band.GetNoDataValue())

    if not np.any(~nodata_mask):
        return None

    valid_values = np.zeros(band_data.shape, dtype=np.uint8)
    valid_values[~nodata_mask] = 1

    polygonize_mask = np.zeros(band_data.shape, dtype=np.uint8)
    polygonize_mask[~nodata_mask] = 255

    mem_driver = gdal.GetDriverByName('MEM')
    mask_ds = mem_driver.Create('', ds.RasterXSize, ds.RasterYSize, 2, gdal.GDT_Byte)
    mask_ds.SetGeoTransform(ds.GetGeoTransform())
    mask_ds.SetProjection(ds.GetProjection())

    value_band = mask_ds.GetRasterBand(1)
    value_band.WriteArray(valid_values)
    value_band.SetNoDataValue(0)

    mask_band = mask_ds.GetRasterBand(2)
    mask_band.WriteArray(polygonize_mask)

    srs = osr.SpatialReference()
    srs.ImportFromWkt(ds.GetProjection())
    srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)

    vector_driver = ogr.GetDriverByName('Memory')
    vector_ds = vector_driver.CreateDataSource('valid_cells')
    out_layer = vector_ds.CreateLayer('valid_cells', srs=srs, geom_type=ogr.wkbPolygon)
    field = ogr.FieldDefn('valid', ogr.OFTInteger)
    out_layer.CreateField(field)

    gdal.Polygonize(value_band, mask_band, out_layer, 0, [], callback=None)

    features_to_delete = []
    for feature in out_layer:
        if feature.GetField('valid') != 1:
            features_to_delete.append(feature.GetFID())

    for fid in features_to_delete:
        out_layer.DeleteFeature(fid)

    if out_layer.GetFeatureCount() == 0:
        return None

    return layer_to_feature_collection(out_layer)


def layer_to_feature_collection(layer):
    """Convert an OGR layer to a GeoJSON FeatureCollection dict."""
    features = []
    layer.ResetReading()
    for feature in layer:
        geom = feature.GetGeometryRef()
        if geom is None or geom.IsEmpty():
            continue
        features.append({
            'type': 'Feature',
            'properties': {'valid': feature.GetField('valid')},
            'geometry': json.loads(geom.ExportToJson()),
        })

    return {'type': 'FeatureCollection', 'features': features}


def write_geojson(feature_collection, output_file):
    """Write a GeoJSON FeatureCollection dict to disk."""
    output_dir = os.path.dirname(os.path.abspath(output_file))
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    with open(output_file, 'w', encoding='utf-8') as handle:
        json.dump(feature_collection, handle)


def process_raster(input_file, output_file, band_spec):
    ds = gdal.Open(input_file)
    if ds is None:
        raise RuntimeError(f'Could not open {input_file}')

    band_idx = get_band_index(ds, band_spec)
    ds = reproject_to_epsg4326(ds, band_idx)

    feature_collection = polygonize_valid_cells(ds, band_idx)
    ds = None

    if feature_collection is None:
        write_geojson_empty(output_file)
        return

    write_geojson(feature_collection, output_file)


def write_geojson_empty(output_file):
    output_dir = os.path.dirname(os.path.abspath(output_file))
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    with open(output_file, 'w', encoding='utf-8') as handle:
        json.dump({'type': 'FeatureCollection', 'features': []}, handle)


def parse_args(argv):
    parser = argparse.ArgumentParser(
        description=(
            'Read a band from a GRIB2 or GeoTIFF file, reproject to EPSG:4326 if needed, '
            'and write GeoJSON polygons for connected regions of valid (non-NoData) cells.'
        )
    )
    parser.add_argument('input_raster', help='Input GRIB2 or GeoTIFF file path')
    parser.add_argument('output_geojson', help='Output GeoJSON file path')
    parser.add_argument(
        '--band',
        type=parse_band_spec,
        default=1,
        dest='band',
        help='Band: 1-based index or KEY=VALUE attribute (default: 1)',
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv or sys.argv[1:])

    try:
        process_raster(args.input_raster, args.output_geojson, args.band)
    except Exception as exc:
        print(f'Error processing file: {exc}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
