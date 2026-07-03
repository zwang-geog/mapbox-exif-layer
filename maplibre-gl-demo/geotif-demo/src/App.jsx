
import { useRef, useEffect, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { ParticleMotion, SmoothRaster } from 'mapbox-exif-layer'
import 'maplibre-gl/dist/maplibre-gl.css';

import './App.css'

const BOUNDS = [-134.1220744907407436, 52.6176194907692292, -60.8992175092592873, 21.1211415092307639];


// Wind color assumes unit is mph; must specify unit in layer constructor if using different unit
const WIND_COLOR = [[0, [0, 195, 255]],
                    [2, [0, 228, 248]],
                    [4, [26, 255, 221]],
                    [6, [53, 255, 194]],
                    [8, [80, 255, 167]],
                    [10, [109, 255, 138]],
                    [12, [137, 255, 110]],
                    [14, [165, 255, 82]],
                    [16, [193, 255, 54]],
                    [18, [219, 255, 27]],
                    [20, [249, 243, 1]],
                    [22, [255, 212, 0]],
                    [24, [255, 182, 0]],
                    [26, [255, 151, 0]],
                    [28, [255, 120, 0]],
                    [30, [255, 89, 0]],
                    [32, [255, 55, 0]],
                    [34, [255, 21, 0]],
                    [36, [220, 0, 0]],
                    [38, [182, 0, 0]],
                    [40, [144, 0, 0]],
                    [42, [128, 0, 0]]];

// Temperature assumes celsius in this example
const TEMPERATURE_COLOR = [[-3.33, [0, 137, 255]],
                           [-2.22, [0, 155, 255]],
                           [-1.11, [0, 176, 255]],
                           [0.0, [0, 194, 255]],
                           [1.11, [0, 214, 254]],
                           [2.22, [5, 235, 242]],
                           [3.33, [19, 251, 228]],
                           [4.44, [36, 255, 211]],
                           [5.56, [50, 255, 197]],
                           [6.67, [67, 255, 180]],
                           [7.78, [81, 255, 166]],
                           [8.89, [98, 255, 149]],
                           [10.0, [115, 255, 131]],
                           [11.11, [132, 255, 115]],
                           [12.22, [149, 255, 98]],
                           [13.33, [163, 255, 84]],
                           [14.44, [180, 255, 67]],
                           [15.56, [194, 255, 52]],
                           [16.67, [211, 255, 36]],
                           [17.78, [228, 255, 19]],
                           [18.89, [242, 251, 5]],
                           [20.0, [254, 232, 0]],
                           [21.11, [255, 215, 0]],
                           [22.22, [255, 196, 0]],
                           [23.33, [255, 179, 0]],
                           [24.44, [255, 159, 0]],
                           [25.56, [255, 140, 0]],
                           [26.67, [255, 121, 0]],
                           [27.78, [255, 102, 0]],
                           [28.89, [255, 85, 0]],
                           [30.0, [255, 66, 0]],
                           [31.11, [255, 50, 0]],
                           [32.22, [255, 30, 0]],
                           [33.33, [249, 14, 0]],
                           [34.44, [225, 1, 0]],
                           [35.56, [202, 0, 0]],
                           [36.67, [181, 0, 0]],
                           [37.78, [158, 0, 0]]];

function App() {
  const mapRef = useRef();
  const mapContainerRef = useRef();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [windOn, setWindOn] = useState(true);
  const [temperatureOn, setTemperatureOn] = useState(false);

  const windParticleLayer = useRef(new ParticleMotion({
    id: 'wind-particle',
    source: '/wind_zstd.tif',
    unit: 'mps',
    color: WIND_COLOR,
    bounds: BOUNDS,
    readyForDisplay: true,
    mapRuntime: 'maplibre',  // Version 1.3.0+
    particleCount: 10000  // 2x than default
  }));

  const temperatureLayer = useRef(new SmoothRaster({
    id: 'temperature',
    source: '/temperature_zstd.tif',
    color: TEMPERATURE_COLOR,
    bounds: BOUNDS,
    readyForDisplay: false,
    mapRuntime: 'maplibre',  // Version 1.3.0+
    opacity: 0.6
  }));

  useEffect(() => {
    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: import.meta.env.VITE_MAP_STYLE ?? 'https://tiles.openfreemap.org/styles/dark',
      zoom: 7,
      center: [-119.699944, 34.432546]
    });

    mapRef.current.on('load', () => {
      mapRef.current.addLayer(temperatureLayer.current);
      mapRef.current.addLayer(windParticleLayer.current);

      // Let map layout property to control temperature layer visibility
      // since temperature layer is initially off by default
      mapRef.current.setLayoutProperty('temperature', 'visibility', 'none');
      temperatureLayer.current.readyForDisplay = true;
      setMapLoaded(true);
    });

    mapRef.current.on('style.load', () => {
      mapRef.current.setProjection({
          type: 'globe', // Set projection to globe
      });
    });

    return () => {
      mapRef.current.remove()
    }
  }, []);

  const setLayerVisibility = (layerId, layerRef, visible) => {
    if (!mapLoaded || !mapRef.current) return;

    if (visible && !layerRef.current.readyForDisplay) {
      layerRef.current.readyForDisplay = true;
    }
    mapRef.current.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
  };

  const toggleWind = () => {
    const next = !windOn;
    setWindOn(next);
    setLayerVisibility('wind-particle', windParticleLayer, next);
  };

  const toggleTemperature = () => {
    const next = !temperatureOn;
    setTemperatureOn(next);
    setLayerVisibility('temperature', temperatureLayer, next);
  };

  return (
    <>
      <div id='map-container' ref={mapContainerRef} />
      <div className="layer-controls">
        <button
          type="button"
          className={windOn ? 'layer-toggle active' : 'layer-toggle'}
          onClick={toggleWind}
          disabled={!mapLoaded}
        >
          Wind {windOn ? 'On' : 'Off'}
        </button>
        <button
          type="button"
          className={temperatureOn ? 'layer-toggle active' : 'layer-toggle'}
          onClick={toggleTemperature}
          disabled={!mapLoaded}
        >
          Temperature {temperatureOn ? 'On' : 'Off'}
        </button>
      </div>
    </>
  )
}

export default App
