
import { useRef, useEffect, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { ParticleMotion, SmoothRaster } from 'mapbox-exif-layer'
import 'mapbox-gl/dist/mapbox-gl.css';

import './App.css'

const BOUNDS = [-134.1220744907407436, 52.6176194907692292, -60.8992175092592873, 21.1211415092307639];

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

const TEMPERATURE_COLOR = [[26, [0, 137, 255]],
                           [28, [0, 155, 255]],
                           [30, [0, 176, 255]],
                           [32, [0, 194, 255]],
                           [34, [0, 214, 254]],
                           [36, [5, 235, 242]],
                           [38, [19, 251, 228]],
                           [40, [36, 255, 211]],
                           [42, [50, 255, 197]],
                           [44, [67, 255, 180]],
                           [46, [81, 255, 166]],
                           [48, [98, 255, 149]],
                           [50, [115, 255, 131]],
                           [52, [132, 255, 115]],
                           [54, [149, 255, 98]],
                           [56, [163, 255, 84]],
                           [58, [180, 255, 67]],
                           [60, [194, 255, 52]],
                           [62, [211, 255, 36]],
                           [64, [228, 255, 19]],
                           [66, [242, 251, 5]],
                           [68, [254, 232, 0]],
                           [70, [255, 215, 0]],
                           [72, [255, 196, 0]],
                           [74, [255, 179, 0]],
                           [76, [255, 159, 0]],
                           [78, [255, 140, 0]],
                           [80, [255, 121, 0]],
                           [82, [255, 102, 0]],
                           [84, [255, 85, 0]],
                           [86, [255, 66, 0]],
                           [88, [255, 50, 0]],
                           [90, [255, 30, 0]],
                           [92, [249, 14, 0]],
                           [94, [225, 1, 0]],
                           [96, [202, 0, 0]],
                           [98, [181, 0, 0]],
                           [100, [158, 0, 0]]];

function App() {
  const mapRef = useRef();
  const mapContainerRef = useRef();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [windOn, setWindOn] = useState(true);
  const [temperatureOn, setTemperatureOn] = useState(false);

  const windParticleLayer = useRef(new ParticleMotion({
    id: 'wind-particle',
    source: '/wind_1.jpeg',
    color: WIND_COLOR,
    bounds: BOUNDS,
    readyForDisplay: true,
    particleCount: 10000  // 2x than default
  }));

  const temperatureLayer = useRef(new SmoothRaster({
    id: 'temperature',
    source: '/te_1.jpeg',
    color: TEMPERATURE_COLOR,
    bounds: BOUNDS,
    readyForDisplay: false,
    opacity: 0.6
  }));

  useEffect(() => {
    const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
    if (!accessToken) {
      console.error('Missing VITE_MAPBOX_ACCESS_TOKEN. Copy .env.example to .env and set your Mapbox token.');
      return;
    }

    mapboxgl.accessToken = accessToken;
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      zoom: 7,
      center: [-119.699944, 34.432546],
      projection: 'mercator'
    });

    mapRef.current.on('load', () => {
      mapRef.current.addLayer(temperatureLayer.current, 'road-label-simple');
      mapRef.current.addLayer(windParticleLayer.current, 'road-label-simple');

      // Let mapbox layout property to control temperature layer visibility
      // since temperature layer is initially off by default
      mapRef.current.setLayoutProperty('temperature', 'visibility', 'none');
      temperatureLayer.current.readyForDisplay = true;
      setMapLoaded(true);
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
