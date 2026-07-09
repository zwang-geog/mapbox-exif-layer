declare module 'mapbox-exif-layer' {
  export class SmoothRaster {
    constructor(options: {
      id: string;
      source: string;
      color: Array<[number, number[]]>;
      /** Required for JPEG; optional for GeoTIFF (read from file). */
      bounds?: [number, number, number, number];
      opacity?: number;
      readyForDisplay?: boolean;
      cacheOption?: 'no-cache' | 'no-store' | 'reload' | 'default' | 'force-cache';
      slot?: string;
      mapRuntime?: 'mapbox' | 'maplibre';
      /** 'auto' detects .tif/.tiff URLs; GeoTIFF requires optional peer `geotiff` */
      sourceType?: 'auto' | 'jpeg' | 'geotiff';
      /** GeoTIFF sample index for scalar data (0 = first band). Default 0. */
      scalarBand?: number;
      /** Fixed [min, max] for colormap when JPEG/PNG has no EXIF scalar metadata. */
      scalarValueRange?: [number, number];
    });
    
    setSource(source: string, color?: Array<[number, number[]]>): void;
  }
  
  export class ParticleMotion {
    constructor(options: {
      id: string;
      source: string;
      color: Array<[number, number[]]>;
      /** Required for JPEG; optional for GeoTIFF (read from file). */
      bounds?: [number, number, number, number];
      particleCount?: number;
      readyForDisplay?: boolean;
      velocityFactor?: number;
      pointSize?: number;
      fadeOpacity?: number;
      updateInterval?: number;
      trailLength?: number;
      trailSizeDecay?: number;
      ageThreshold?: number;
      maxAge?: number;
      unit?: 'mph' | 'kph' | 'mps';
      /** Fixed [min, max] for u/v denormalization when JPEG/PNG has no EXIF velocity metadata. */
      velocityRange?: [number, number];
      cacheOption?: 'no-cache' | 'no-store' | 'reload' | 'default' | 'force-cache';
      slot?: string;
      mapRuntime?: 'mapbox' | 'maplibre';
      /** 'auto' detects .tif/.tiff URLs; GeoTIFF requires optional peer `geotiff` */
      sourceType?: 'auto' | 'jpeg' | 'geotiff';
      /** GeoTIFF sample index for u component (0 = first band). Default 0. */
      uBand?: number;
      /** GeoTIFF sample index for v component (0 = first band). Default 1. */
      vBand?: number;
    });

    setSource(source: string, percentReset?: number): void;
  }

   /**
   * Minimal structural type for a Mapbox GL JS or MapLibre GL JS map instance.
   * Both runtimes satisfy this interface without any casting.
   */
   interface MapInstance {
    addSource(id: string, source: object): unknown;
    addLayer(layer: object, beforeId?: string): unknown;
    getLayer(id: string): object | undefined;
    getSource(id: string): object | undefined;
    removeLayer(id: string): unknown;
    removeSource(id: string): unknown;
  }

  /**
   * Fetches an RGB or RGBA GeoTIFF (PhotometricInterpretation=2), decodes it, and adds
   * a native `image` source + `raster` layer to a Mapbox GL JS or MapLibre GL JS map.
   * Blob URL memory is automatically released on `remove()`.
   *
   * @example
   * const layer = new RgbGeoTiff({ id: 'photo', source: 'photo.tif', opacity: 0.9 });
   * map.on('load', () => layer.addTo(map));
   * // later:
   * layer.remove();
   */
  export class RgbGeoTiff {
    constructor(options: {
      id: string;
      /** URL to an RGB or RGBA GeoTIFF (must be EPSG:4326, uint8 or uint16 bands). */
      source: string;
      opacity?: number;
      cacheOption?: 'no-cache' | 'no-store' | 'reload' | 'default' | 'force-cache';
      /** Mapbox v3 slot for layer ordering. */
      slot?: string;
      /** Insert the raster layer before this existing layer id. */
      beforeLayerId?: string;
    });

    /** Fetch, decode, and add the layer to the map. Returns `this` for chaining. */
    addTo(map: MapInstance): this;

    /** Remove the layer and source from the map and revoke the internal blob URL. */
    remove(): void;
  }

}
