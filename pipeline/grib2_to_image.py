import sys
import numpy as np
from osgeo import gdal
gdal.UseExceptions()  # Suppress FutureWarning and enable exceptions
import os
from PIL import Image
import piexif
import json

def build_nodata_mask(band_data, nodata_value, existing_mask=None):
    """Return a boolean mask where True marks NoData pixels."""
    mask = existing_mask.copy() if existing_mask is not None else np.zeros(band_data.shape, dtype=bool)
    if nodata_value is not None:
        mask |= band_data == nodata_value
    return mask

def normalize_array(arr, nodata_mask=None):
    """Normalize array to 0-255 range, encoding NoData pixels as 0."""
    if nodata_mask is not None:
        valid = ~nodata_mask
        if not np.any(valid):
            return np.zeros(arr.shape, dtype=np.uint8), 0.0, 0.0
        arr_min = np.min(arr[valid])
        arr_max = np.max(arr[valid])
    else:
        valid = np.ones(arr.shape, dtype=bool)
        arr_min = np.min(arr)
        arr_max = np.max(arr)

    normalized = np.zeros(arr.shape, dtype=np.uint8)
    if arr_max == arr_min:
        return normalized, float(arr_min), float(arr_max)

    print(arr_min, arr_max)
    normalized[valid] = ((arr[valid] - arr_min) * 255 / (arr_max - arr_min)).astype(np.uint8)
    return normalized, float(arr_min), float(arr_max)

def build_mask_band(nodata_mask, two_band=False):
    """Build B channel: single-band uses 255=NA; two-band (wind) uses 0=NA, 255=valid."""
    mask_band = np.zeros(nodata_mask.shape, dtype=np.uint8)
    if two_band:
        mask_band[~nodata_mask] = 255
    else:
        mask_band[nodata_mask] = 255
    return mask_band

def celsius_to_fahrenheit(arr):
    """Convert temperature from Celsius to Fahrenheit."""
    return (arr * 9/5) + 32

def ms_to_mph(arr):
    """Convert speed from m/s to mph."""
    return arr * 2.23694

def ms_to_kph(arr):
    """Convert speed from m/s to kph."""
    return arr * 3.6

def find_band_by_attribute(ds, attribute_str):
    """Find band index by matching metadata attribute.
    
    Args:
        ds: GDAL dataset
        attribute_str: String in format "KEY=VALUE"
    
    Returns:
        Band index (1-based) if found, None if not found
    """
    if not attribute_str or '=' not in attribute_str:
        return None
        
    key, value = attribute_str.split('=')
    
    for i in range(1, ds.RasterCount + 1):
        band = ds.GetRasterBand(i)
        metadata = band.GetMetadata()
        if metadata.get(key) == value:
            return i
    
    return None

def get_band_index(ds, band_spec):
    """Get band index from band specification.
    
    Args:
        ds: GDAL dataset
        band_spec: Integer band index or string attribute specification
    
    Returns:
        Integer band index
    
    Raises:
        Exception if band cannot be found
    """
    if isinstance(band_spec, int):
        return band_spec
    elif isinstance(band_spec, str):
        band_idx = find_band_by_attribute(ds, band_spec)
        if band_idx is None:
            raise Exception(f"Could not find band matching attribute: {band_spec}")
        return band_idx
    else:
        raise Exception(f"Invalid band specification type: {type(band_spec)}")

def process_grib(input_file, output_suffix, config_file):
    """Process a raster file and convert to EXIF-enabled JPEG based on configuration."""
    ds = gdal.Open(input_file)
    if ds is None:
        raise Exception(f"Could not open {input_file}")

    # Get input file directory
    input_dir = os.path.dirname(os.path.abspath(input_file))

    # Get geotransform information
    geotransform = ds.GetGeoTransform()
    projection = ds.GetProjection()
    
    # Calculate bounds
    width = ds.RasterXSize
    height = ds.RasterYSize
    minx = geotransform[0]
    maxy = geotransform[3]
    maxx = minx + width * geotransform[1]
    miny = maxy + height * geotransform[5]

    # Load configuration
    with open(config_file, 'r') as f:
        config = json.load(f)

    # Process each parameter in the configuration
    for param_name, param_config in config.items():
        # Prepare output filename with full path
        output_file = os.path.join(input_dir, f"{param_name}/{param_name}_{output_suffix}.jpeg")
        # Create directory if it doesn't exist
        os.makedirs(f"{input_dir}/{param_name}", exist_ok=True)
        
        # Convert band specification to list if it's not already
        band_specs = param_config['band'] if isinstance(param_config['band'], list) else [param_config['band']]
        
        # Convert band specifications to actual band indices
        try:
            bands = [get_band_index(ds, band_spec) for band_spec in band_specs]
        except Exception as e:
            print(f"Warning: Skipping {param_name} due to error: {str(e)}")
            continue

        raw_bands = []
        nodata_mask = None

        for band_idx in bands:
            raster_band = ds.GetRasterBand(band_idx)
            band_data = raster_band.ReadAsArray()
            nodata_mask = build_nodata_mask(band_data, raster_band.GetNoDataValue(), nodata_mask)
            raw_bands.append(band_data)

        normalized_bands = []
        min_max_values = []

        for band_data in raw_bands:
            if param_config.get('to_fahrenheit', False):
                band_data = celsius_to_fahrenheit(band_data)
            if param_config.get('to_mph', False):
                band_data = ms_to_mph(band_data)
            elif param_config.get('to_kph', False):
                band_data = ms_to_kph(band_data)

            normalized_band, band_min, band_max = normalize_array(band_data, nodata_mask)
            normalized_bands.append(normalized_band)
            min_max_values.append((band_min, band_max))

        if len(raw_bands) == 2:
            u = np.where(nodata_mask, 0, raw_bands[0])
            v = np.where(nodata_mask, 0, raw_bands[1])
            speed_band = np.sqrt(u**2 + v**2)

            if param_config.get('to_mph', False):
                speed_band = ms_to_mph(speed_band)
            elif param_config.get('to_kph', False):
                speed_band = ms_to_kph(speed_band)

            valid = ~nodata_mask
            if np.any(valid):
                speed_min = float(np.min(speed_band[valid]))
                speed_max = float(np.max(speed_band[valid]))
            else:
                speed_min = speed_max = 0.0
            print(speed_min, speed_max)
            min_max_values.append((speed_min, speed_max))

        mask_band = build_mask_band(nodata_mask, two_band=len(normalized_bands) == 2)

        # Create RGB array
        if len(normalized_bands) == 1:
            rgb_array = np.stack([normalized_bands[0],
                                np.zeros_like(normalized_bands[0]),
                                mask_band], axis=2)
        elif len(normalized_bands) == 2:
            rgb_array = np.stack([normalized_bands[0],
                                normalized_bands[1],
                                mask_band], axis=2)
        else:
            rgb_array = np.stack(normalized_bands[:3], axis=2)

        # Create PIL Image
        image = Image.fromarray(rgb_array, 'RGB')

        description = ''.join([f"{min_val},{max_val};" for min_val, max_val in min_max_values])
        exif_dict = {
            "0th": {},
            "Exif": {},
            "GPS": {},
            "1st": {},
            "thumbnail": None
        }
        exif_dict["0th"][piexif.ImageIFD.ImageDescription] = description.encode('utf-8')
        exif_bytes = piexif.dump(exif_dict)

        image.save(output_file, 'JPEG', quality=95, optimize=True, exif=exif_bytes)

    # Write bounds to text file in the same directory
    bounds_file = os.path.join(input_dir, f"bounds_{output_suffix}.txt")
    with open(bounds_file, 'w') as f:
        f.write(f"minx: {minx}\nmaxx: {maxx}\nminy: {miny}\nmaxy: {maxy}\n")
    
    # Clean up
    ds = None

def main():
    if len(sys.argv) < 4:
        print("Usage: python grib2_to_image.py <input_raster> <output_suffix> <config_json>")
        sys.exit(1)

    input_file = sys.argv[1]
    output_suffix = sys.argv[2]
    config_file = sys.argv[3]

    try:
        process_grib(input_file, output_suffix, config_file)
    except Exception as e:
        print(f"Error processing file: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main() 