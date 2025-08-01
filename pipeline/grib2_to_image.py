import sys
import numpy as np
from osgeo import gdal
import os
from PIL import Image
from PIL.ExifTags import TAGS
import piexif
import json

def normalize_array(arr):
    """Normalize array to 0-255 range."""
    arr_min = np.min(arr)
    arr_max = np.max(arr)
    if arr_max == arr_min:
        return np.zeros_like(arr), arr_min, arr_max
    normalized = ((arr - arr_min) * 255 / (arr_max - arr_min)).astype(np.uint8)
    return normalized, arr_min, arr_max

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

def process_grib(input_file, output_suffix, config_file, output_format='jpeg', add_exif=True):
    """Process GRIB2 file and convert to image based on configuration."""
    # Open the GRIB file
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
        output_file = os.path.join(input_dir, f"{param_name}/{param_name}_{output_suffix}.{output_format}")
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

        normalized_bands = []
        min_max_values = []

        # Process each band
        for band_idx in bands:
            # Read band data
            band_data = ds.GetRasterBand(band_idx).ReadAsArray()
            
            # Apply conversions if needed
            if param_config.get('to_fahrenheit', False):
                band_data = celsius_to_fahrenheit(band_data)
            if param_config.get('to_mph', False):
                band_data = ms_to_mph(band_data)
            elif param_config.get('to_kph', False):
                band_data = ms_to_kph(band_data)
            
            # Normalize band
            normalized_band, band_min, band_max = normalize_array(band_data)
            normalized_bands.append(normalized_band)
            min_max_values.append((band_min, band_max))
        
        if param_config.get('calculate_speed', False):
            # Calculate speed from u and v components
            u_band = ds.GetRasterBand(1).ReadAsArray()
            v_band = ds.GetRasterBand(2).ReadAsArray()
            
            # Calculate speed from u and v components
            speed_band = np.sqrt(u_band**2 + v_band**2)

            if param_config.get('to_mph', False):
                speed_band = ms_to_mph(speed_band)
            elif param_config.get('to_kph', False):
                speed_band = ms_to_kph(speed_band)
            
            normalized_band, band_min, band_max = normalize_array(speed_band)
            normalized_bands.append(normalized_band)
            min_max_values.append((band_min, band_max))

        # Create RGB array
        if len(normalized_bands) == 1:
            rgb_array = np.stack([normalized_bands[0], 
                                np.zeros_like(normalized_bands[0]), 
                                np.zeros_like(normalized_bands[0])], axis=2)
        elif len(normalized_bands) == 2:
            rgb_array = np.stack([normalized_bands[0], 
                                normalized_bands[1], 
                                np.zeros_like(normalized_bands[0])], axis=2)
        else:
            rgb_array = np.stack(normalized_bands[:3], axis=2)

        # Create PIL Image
        image = Image.fromarray(rgb_array, 'RGB')
        
        if add_exif:
            # Create EXIF data with metadata
            description = ''.join([f"{min_val},{max_val};" for min_val, max_val in min_max_values])
            
            # Create EXIF dictionary
            exif_dict = {
                "0th": {},
                "Exif": {},
                "GPS": {},
                "1st": {},
                "thumbnail": None
            }
            
            # Add image description to EXIF
            exif_dict["0th"][piexif.ImageIFD.ImageDescription] = description.encode('utf-8')
            
            # Convert EXIF dict to bytes
            exif_bytes = piexif.dump(exif_dict)
            
            # Save image with EXIF metadata
            image.save(output_file, output_format.upper(), 
                      quality=95 if output_format.lower() == 'jpeg' else None,
                      optimize=True, exif=exif_bytes)
        else:
            # Save image without EXIF metadata
            image.save(output_file, output_format.upper(),
                      quality=95 if output_format.lower() == 'jpeg' else None,
                      optimize=True)

    # Write bounds to text file in the same directory
    bounds_file = os.path.join(input_dir, f"bounds_{output_suffix}.txt")
    with open(bounds_file, 'w') as f:
        f.write(f"minx: {minx}\nmaxx: {maxx}\nminy: {miny}\nmaxy: {maxy}\n")
    
    # Clean up
    ds = None

def main():
    if len(sys.argv) < 5:
        print("Usage: python grib2_to_image.py <input_grib2> <output_suffix> <config_json> [output_format] [add_exif]")
        print("output_format: jpeg or png (default: jpeg)")
        print("add_exif: true or false (default: true)")
        sys.exit(1)

    input_file = sys.argv[1]
    output_suffix = sys.argv[2]
    config_file = sys.argv[3]
    output_format = sys.argv[4].lower() if len(sys.argv) > 4 else 'jpeg'
    add_exif = sys.argv[5].lower() == 'true' if len(sys.argv) > 5 else True

    if output_format not in ['jpeg', 'png']:
        print("Error: output_format must be either 'jpeg' or 'png'")
        sys.exit(1)

    try:
        process_grib(input_file, output_suffix, config_file, output_format, add_exif)
    except Exception as e:
        print(f"Error processing file: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main() 