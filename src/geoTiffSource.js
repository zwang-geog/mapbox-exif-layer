async function loadGeoTiffModule() {
    try {
        return await import('geotiff');
    } catch {
        throw new Error(
            'mapbox-exif-layer: GeoTIFF sources require the optional "geotiff" package. Install it with: npm install geotiff'
        );
    }
}

/** @typedef {'auto' | 'jpeg' | 'geotiff'} SourceType */

/**
 * @param {string} source
 * @param {SourceType} [sourceType='auto']
 * @returns {boolean}
 */
export function isSourceFormatGeotiff(source, sourceType = 'auto') {
    if (sourceType === 'jpeg') {
        return false;
    }
    if (sourceType === 'geotiff') {
        return true;
    }
    // .tif (common) and .tiff
    return /\.tif(f)?$/i.test(source);
}

/**
 * @param {import('geotiff').GeoTIFFImage} image
 */
function assertEpsg4326(image) {
    const geoKeys = image.getGeoKeys?.() ?? image.geoKeys ?? null; // geotiff v3 uses getGeoKeys(); v2 exposes geoKeys on the image.
    if (!geoKeys) {
        throw new Error('mapbox-exif-layer: GeoTIFF is missing geoKeys; EPSG:4326 is required.');
    }
    const epsg = geoKeys.ProjectedCSTypeGeoKey || geoKeys.GeographicTypeGeoKey;
    if (epsg !== 4326) {
        throw new Error(
            `mapbox-exif-layer: GeoTIFF must use EPSG:4326 (found EPSG:${epsg ?? 'unknown'}). Reproject with gdalwarp -t_srs EPSG:4326.`
        );
    }
}

/**
 * GeoTIFF bbox is [west, south, east, north].
 * Layer bounds are [minX, maxY, maxX, minY].
 * @param {import('geotiff').GeoTIFFImage} image
 * @returns {[number, number, number, number]}
 */
export function boundsFromGeoTiffImage(image) {
    const bbox = image.getBoundingBox();
    return [bbox[0], bbox[3], bbox[2], bbox[1]];
}

/**
 * @param {Float32Array | Float64Array | Int16Array | Int32Array | Uint16Array | Uint32Array} band
 * @param {number | null} noData
 * @returns {Float32Array}
 */
function bandToFloat32WithNaN(band, noData) {
    const out = new Float32Array(band.length);
    for (let i = 0; i < band.length; i++) {
        const value = band[i];
        if ((noData != null && value === noData) || !Number.isFinite(value)) {
            out[i] = NaN;
        } else {
            out[i] = value;
        }
    }
    return out;
}

export function kphToMph(kph) {
    return kph * 0.621371;
}

export function mpsToMph(mps) {
    return mps * 2.23694;
}

/**
 * @param {Float32Array | Float64Array | Int16Array | Int32Array | Uint16Array | Uint32Array} raster interleaved [u, v, u, v, …]
 * @param {number | null} noData
 * @param {'mph' | 'kph' | 'mps'} unit
 * @returns {Float32Array}
 */
function processInterleavedWindRaster(raster, noData, unit) {
    const out = new Float32Array(raster.length);

    for (let i = 0; i < raster.length; i += 2) {
        let u = raster[i];
        let v = raster[i + 1];
        const invalid =
            (noData != null && (u === noData || v === noData)) ||
            !Number.isFinite(u) ||
            !Number.isFinite(v);

        if (invalid) {
            out[i] = NaN;
            out[i + 1] = NaN;
            continue;
        }

        if (unit === 'kph') {
            u = kphToMph(u);
            v = kphToMph(v);
        } else if (unit === 'mps') {
            u = mpsToMph(u);
            v = mpsToMph(v);
        }

        out[i] = u;
        out[i + 1] = v;
    }

    return out;
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {{ scalarBand?: number }} [options]
 * @returns {Promise<{ width: number, height: number, bounds: [number, number, number, number], data: Float32Array }>}
 */
export async function loadGeoTiffScalar(arrayBuffer, {scalarBand = 0} = {}) {
    const {fromArrayBuffer} = await loadGeoTiffModule();
    const tiff = await fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();
    assertEpsg4326(image);

    const width = image.getWidth();
    const height = image.getHeight();
    const noData = image.getGDALNoData();
    const [band] = await image.readRasters({samples: [scalarBand], interleave: false});
    const data = bandToFloat32WithNaN(band, noData);

    return {
        width,
        height,
        bounds: boundsFromGeoTiffImage(image),
        data,
    };
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @param {{ uBand?: number, vBand?: number, unit?: 'mph' | 'kph' | 'mps' }} [options]
 * @returns {Promise<{ width: number, height: number, bounds: [number, number, number, number], data: Float32Array }>}
 */
export async function loadGeoTiffWind(arrayBuffer, {uBand = 0, vBand = 1, unit = 'mph'} = {}) {
    const {fromArrayBuffer} = await loadGeoTiffModule();
    const tiff = await fromArrayBuffer(arrayBuffer);
    const image = await tiff.getImage();
    assertEpsg4326(image);

    const width = image.getWidth();
    const height = image.getHeight();
    const noData = image.getGDALNoData();
    const raster = await image.readRasters({samples: [uBand, vBand], interleave: true});
    const data = processInterleavedWindRaster(raster, noData, unit);

    return {
        width,
        height,
        bounds: boundsFromGeoTiffImage(image),
        data,
    };
}

/**
 * @param {number} width
 * @param {number} height
 * @param {WebGLRenderingContext} gl
 */
export function assertTextureDimensions(width, height, gl) {
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (width > maxSize || height > maxSize) {
        throw new Error(
            `mapbox-exif-layer: GeoTIFF dimensions ${width}x${height} exceed MAX_TEXTURE_SIZE (${maxSize}). Downsample the raster before use.`
        );
    }
}
