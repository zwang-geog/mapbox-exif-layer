declare module 'mapbox-exif-layer' {
  export class SmoothRaster {
    constructor(options: {
      id: string;
      source: string;
      color: Array<[number, number[]]>;
      bounds: [number, number, number, number];
      opacity?: number;
      readyForDisplay?: boolean;
      cacheOption?: 'no-cache' | 'no-store' | 'reload' | 'default' | 'force-cache';
      slot?: string;
    });
    
    setSource(source: string, color?: Array<[number, number[]]>): void;
  }
  
  export class ParticleMotion {
    constructor(options: {
      id: string;
      source: string;
      color: Array<[number, number[]]>;
      bounds: [number, number, number, number];
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
      cacheOption?: 'no-cache' | 'no-store' | 'reload' | 'default' | 'force-cache';
      slot?: string;
    });
    
    setSource(source: string, percentReset?: number): void;
  }
}
