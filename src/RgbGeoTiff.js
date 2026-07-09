import { loadGeoTiffRgb } from './geoTiffSource.js';

export default class RgbGeoTiff {
    /**
     * @param {object} options
     * @param {string} options.id          Layer id (also used as the base for the internal source id).
     * @param {string} options.source      URL to the RGB/RGBA GeoTIFF file (must be EPSG:4326).
     * @param {number} [options.opacity=1.0]
     * @param {string} [options.cacheOption='no-cache']
     * @param {string} [options.slot]      Mapbox v3 slot for layer ordering.
     * @param {string} [options.beforeLayerId]  Insert the raster layer below this existing layer id in the stack.
     */
    constructor({id, source, opacity = 1.0, cacheOption = 'no-cache', slot, beforeLayerId} = {}) {
        this.id = id;
        this.source = source;
        this.opacity = opacity;
        this.cacheOption = cacheOption;
        this.slot = slot;
        this.beforeLayerId = beforeLayerId;

        this._sourceId = `${id}-rgb-source`;
        this._blobUrl = null;
        this._map = null;
    }

    /**
     * Fetch the GeoTIFF, decode it, and add the image source + raster layer to the map.
     * Returns `this` so calls can be chained.
     * @param {object} map  Mapbox GL JS or MapLibre GL JS map instance.
     * @returns {RgbGeoTiff}
     */
    addTo(map) {
        this._map = map;
        this._load();
        return this;
    }

    _load() {
        fetch(this.source, {cache: this.cacheOption})
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`RgbGeoTiff: failed to fetch GeoTIFF (${response.status})`);
                }
                return response.arrayBuffer();
            })
            .then(async (arrayBuffer) => {
                const {url, bounds} = await loadGeoTiffRgb(arrayBuffer);

                if (!this._map) {
                    // remove() was called before the fetch completed
                    URL.revokeObjectURL(url);
                    return;
                }

                const [west, north, east, south] = bounds;
                this._blobUrl = url;

                this._map.addSource(this._sourceId, {
                    type: 'image',
                    url,
                    coordinates: [
                        [west, north],
                        [east, north],
                        [east, south],
                        [west, south],
                    ],
                });

                const layerSpec = {
                    id: this.id,
                    type: 'raster',
                    source: this._sourceId,
                    paint: {'raster-opacity': this.opacity},
                };

                if (this.slot !== undefined) {
                    layerSpec.slot = this.slot;
                }

                this._map.addLayer(layerSpec, this.beforeLayerId);
            })
            .catch((err) => {
                console.error('RgbGeoTiff:', err);
            });
    }

    /**
     * Remove the layer and source from the map and release the blob URL.
     */
    remove() {
        if (this._map) {
            if (this._map.getLayer(this.id)) {
                this._map.removeLayer(this.id);
            }
            if (this._map.getSource(this._sourceId)) {
                this._map.removeSource(this._sourceId);
            }
        }

        if (this._blobUrl) {
            URL.revokeObjectURL(this._blobUrl);
            this._blobUrl = null;
        }

        this._map = null;
    }
}
