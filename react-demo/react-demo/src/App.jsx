
import { useRef, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import { ParticleMotion } from 'mapbox-exif-layer'
import 'mapbox-gl/dist/mapbox-gl.css';

import './App.css'

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

function App() {

  const mapRef = useRef();
  const mapContainerRef = useRef();

  const windParticleLayer = useRef(new ParticleMotion({
    id: 'wind-particle',
    source:  'https://ucsb-wri-data.s3.us-west-1.amazonaws.com/wind-images/wind_output.jpeg',
    color: WIND_COLOR,
    bounds: [-121, 36, -117, 32],
    readyForDisplay: true
  }));

  useEffect(() => {
    mapboxgl.accessToken = 'pk.eyJ1IjoiemlmYW53OSIsImEiOiJjbThvcm5tdnYwM2xpMmtvZGFnZ2xvanNlIn0.JX_s1DRAEYY67sjw0tOvlg'
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      zoom: 7,
      center: [-119.699944,34.432546],
      projection: "mercator"
    });

    mapRef.current.on('load', () => {
      mapRef.current.addLayer(windParticleLayer.current, 'road-label-simple');
    });

    return () => {
      mapRef.current.remove()
    }
  }, [])

  return (
    <>
      <div id='map-container' ref={mapContainerRef}/>
    </>
  )
}

export default App