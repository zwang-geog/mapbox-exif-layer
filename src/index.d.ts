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
}
