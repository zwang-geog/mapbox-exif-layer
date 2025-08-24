/*
Acknowledgements:
This file is a derivative work of UC Santa Barbara Wildfire Resilience Initiative's webapp
https://www.webapp.wri.ucsb.edu/
*/

import './App.css'
import { weatherColorMap, weatherUrl, WeatherColorbar, getCurrentTime, StyleToggleControl } from './util.jsx'
import { useRef, useEffect, useState } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import { SmoothRaster, ParticleMotion } from 'mapbox-exif-layer'
import mapboxgl from 'mapbox-gl';
import { 
  Slider, 
  IconButton, 
  FormGroup, 
  FormControlLabel, 
  Checkbox,
  RadioGroup,
  Radio,
  Button,
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent
} from '@mui/material'
import {
  SkipPrevious,
  FastRewind,
  PlayArrow,
  Pause,
  FastForward,
  SkipNext
} from '@mui/icons-material'

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiemlmYW53OSIsImEiOiJjbThvcm5tdnYwM2xpMmtvZGFnZ2xvanNlIn0.JX_s1DRAEYY67sjw0tOvlg';

function App() {
  const mapRef = useRef();
  const mapContainerRef = useRef();
  const [mapLoaded, setMapLoaded] = useState(false);

  const smoothRasterLayerRef = useRef();
  const windParticleLayerRef = useRef();

  // Store those as refs in case base layer is changed
  const smoothRasterLayerMappedAttributeRef = useRef("temperature");
  const forecastTimestepRef = useRef("00");
  const smoothRasterLayerIsOnRef = useRef(true);
  const windParticleLayerIsOnRef = useRef(false);

  // Store those as states for user interaction
  const [smoothRasterLayerMappedAttribute, setSmoothRasterLayerMappedAttribute] = useState("temperature");
  const [forecastTimestep, setForecastTimestep] = useState("00");
  const [activeLayerIds, setActiveLayerIds] = useState(["smooth-raster"]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [windLegendOpen, setWindLegendOpen] = useState(false);
  const [rasterLegendOpen, setRasterLegendOpen] = useState(false);

  const timerRef = useRef(null);

  useEffect(() => {
    const nextHour = getCurrentTime();
    setForecastTimestep(nextHour);
    forecastTimestepRef.current = nextHour;
  }, []); // Empty dependency array means it runs once on mount

  // Reusable function when base layer is changed
  const addLayers = (bottomlabellayername) => {
    smoothRasterLayerRef.current = new SmoothRaster({
      id: 'smooth-raster',
      source: weatherUrl(smoothRasterLayerMappedAttributeRef.current, forecastTimestepRef.current),
      color: weatherColorMap[smoothRasterLayerMappedAttributeRef.current],
      opacity: 0.6,
      bounds: [-121, 36, -117, 32],
      readyForDisplay: smoothRasterLayerIsOnRef.current
    });
  
    // Wind layer will not be shown when the map is first loaded.
    windParticleLayerRef.current = new ParticleMotion({
      id: 'wind-particle',
      source: weatherUrl("wind", forecastTimestepRef.current),
      color: weatherColorMap["wind"],
      bounds: [-121, 36, -117, 32],
      readyForDisplay: windParticleLayerIsOnRef.current
    });

    mapRef.current.addLayer(smoothRasterLayerRef.current, bottomlabellayername);
    mapRef.current.addLayer(windParticleLayerRef.current, bottomlabellayername);
  }

  const updateActiveLayerState = (e) => {
    const layerId = e.target.id;
    if (layerId == 'smooth-raster') {
      smoothRasterLayerIsOnRef.current = !smoothRasterLayerIsOnRef.current;

      // If layer object is still not having readyForDisplay set to true while layer should be on, update it
      if (!smoothRasterLayerRef.current.readyForDisplay && smoothRasterLayerRef.current.readyForDisplay != smoothRasterLayerIsOnRef.current) {
        smoothRasterLayerRef.current.readyForDisplay = smoothRasterLayerIsOnRef.current;
      }
      mapRef.current.setLayoutProperty('smooth-raster', 'visibility', smoothRasterLayerIsOnRef.current ? 'visible' : 'none');
    }
    else if (layerId == 'wind-particle') {
      windParticleLayerIsOnRef.current = !windParticleLayerIsOnRef.current;

      // If layer object is still not having readyForDisplay set to true while layer should be on, update it
      if (!windParticleLayerRef.current.readyForDisplay && windParticleLayerRef.current.readyForDisplay != windParticleLayerIsOnRef.current) {
        windParticleLayerRef.current.readyForDisplay = windParticleLayerIsOnRef.current;
      }
      mapRef.current.setLayoutProperty('wind-particle', 'visibility', windParticleLayerIsOnRef.current ? 'visible' : 'none');
    }

    if (activeLayerIds.includes(layerId)) {
      setActiveLayerIds(activeLayerIds.filter((d)=>d !== layerId));
    }
    else {
      setActiveLayerIds([...activeLayerIds, layerId]);
    }
  }

  const addMapControls = () => {
    // Add custom style toggle control
    mapRef.current.addControl(new StyleToggleControl(), 'top-right');

    // zoom-in, zoom-out, compass
    mapRef.current.addControl(
      new mapboxgl.NavigationControl(), 'top-left'
    );

    // ratio of a distance on the map
    mapRef.current.addControl(
      new mapboxgl.ScaleControl({unit: 'imperial'}), 'bottom-left'
    );

    mapRef.current.addControl(
      new mapboxgl.FullscreenControl(), 'top-left'
    );

    mapRef.current.addControl(
      new mapboxgl.AttributionControl({
        compact: true,
        customAttribution: [
          '© <a href="https://www.wri.ucsb.edu" target="_blank">UC Santa Barbara Wildfire Resilience Initiative</a> '+
          '© <a href="https://nomads.ncep.noaa.gov/" target="_blank">NOAA Operational Model Archive and Distribution System</a>']
      }), 'bottom-right'
    );
  };

  // Handling of smooth raster layer mapped attribute change
  useEffect(() => {
    smoothRasterLayerMappedAttributeRef.current = smoothRasterLayerMappedAttribute;

    if (!mapLoaded) return;

    // Update both source url and color schema with one single call and repaint
    smoothRasterLayerRef.current.setSource(
      weatherUrl(smoothRasterLayerMappedAttributeRef.current, forecastTimestepRef.current),
      weatherColorMap[smoothRasterLayerMappedAttributeRef.current]
    );
    
  }, [smoothRasterLayerMappedAttribute]);

  // Handling of forecast timestep change
  useEffect(() => {
    forecastTimestepRef.current = forecastTimestep;

    if (!mapLoaded) return;

    // Only need to update source url because the color schema remains the same
    smoothRasterLayerRef.current.setSource(
      weatherUrl(smoothRasterLayerMappedAttributeRef.current, forecastTimestepRef.current)
    );

    windParticleLayerRef.current.setSource(
      weatherUrl("wind", forecastTimestepRef.current),
      0.5 // reset at least 50% of particles' positions when source is updated for quick reflection of the new pattern 
    );
  }, [forecastTimestep]);

  // Handle animation timer
  useEffect(() => {
    if (isPlaying) {
      // start playing
      setForecastTimestep(prev => {
        const num = parseInt(prev) + 1;
        return num > 48 ? '00' : `${String(num).padStart(2, '0')}`;
      });
      // setup timer
      timerRef.current = setInterval(() => {
        setForecastTimestep(prev => {
          const num = parseInt(prev) + 1;
          return num > 48 ? '00' : `${String(num).padStart(2, '0')}`;
        });
      }, 4000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isPlaying]);

  useEffect(() => {
    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      zoom: 7,
      center: [-119.699944,34.432546],
      projection: 'mercator'  // Projection must be explicitly set to mercator
    });

    mapRef.current.on('load', () => {
      setMapLoaded(true);
      addMapControls();
    });

    mapRef.current.on('style.load', () => {
      addLayers("road-label"); // Custom layers will be added below road-label layer
    });

    mapRef.current.on('error', (e) => {
      console.error('Map error:', e);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
      }
    };

  }, []);


  // Convert UTC hour to Pacific time
  const utcToLocalHour = (utcHour) => {
    // Create a Date object for today at UTC midnight
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    
    // Add the hours as milliseconds
    // This correctly handles hours >= 24 by advancing the date
    date.setTime(date.getTime() + (parseInt(utcHour) * 60 * 60 * 1000));
    
    // Get the hour in local time (this automatically handles DST)
    const localHour = date.getHours();
    return localHour;
  };

  return (
    <>
      <div id='map-container' ref={mapContainerRef} />
      
      {/* Control Panel */}
      <Box sx={{ 
        position: 'absolute', 
        bottom: 20, 
        left: '50%', 
        transform: 'translateX(-50%)',
        bgcolor: 'rgba(255,255,255,0.9)',
        p: 1.5,
        borderRadius: 1,
        width: '90%',
        maxWidth: 600,
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
      }}>
        {/* Time Slider */}
        <Box sx={{ width: '90%', mb: 0.5, mx: 'auto' }}>
            <Slider
              sx={{ py: 0.5 }} // Reduce padding top/bottom
            size="small"
            value={parseInt(forecastTimestep)}
            min={0}
            max={48}
            step={1}
            marks={[
              { value: 0, label: `${utcToLocalHour('00')}:00` },
              { value: 12, label: `${utcToLocalHour('12')}:00` },
              { value: 24, label: `${utcToLocalHour('24')}:00 +1` },
              { value: 36, label: `${utcToLocalHour('36')}:00 +1` },
              { value: 48, label: `${utcToLocalHour('48')}:00 +1` }
            ]}
            onChange={(_, value) => setForecastTimestep(String(value).padStart(2, '0'))}
          />
        </Box>

        {/* Playback Controls */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 0.5 }}>
          <IconButton
            size="small" onClick={() => setForecastTimestep(prev => {
            const num = (parseInt(prev) - 3 + 49) % 49;  // +49 to handle negative numbers
            return String(num).padStart(2, '0');
          })}>
            <FastRewind />
          </IconButton>
          <IconButton onClick={() => setForecastTimestep(prev => {
            const num = (parseInt(prev) - 1 + 49) % 49;
            return String(num).padStart(2, '0');
          })}>
            <SkipPrevious />
          </IconButton>
          <IconButton onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>
          <IconButton onClick={() => setForecastTimestep(prev => {
            const num = (parseInt(prev) + 1) % 49;
            return String(num).padStart(2, '0');
          })}>
            <SkipNext />
          </IconButton>
          <IconButton onClick={() => setForecastTimestep(prev => {
            const num = (parseInt(prev) + 3) % 49;
            return String(num).padStart(2, '0');
          })}>
            <FastForward />
          </IconButton>
        </Box>

        {/* Layer Controls */}
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: 'auto 1fr auto',
          gap: 1,
          alignItems: 'start'
        }}>
          <Box>
            {/* Layer Toggles */}
            <FormGroup 
              size="small"
              sx={{ '& .MuiFormControlLabel-root': { my: -0.5 } }}
            >
              <FormControlLabel
                control={
                  <Checkbox 
                    id="smooth-raster"
                    size="small"
                    checked={activeLayerIds.includes('smooth-raster')}
                    onChange={updateActiveLayerState}
                  />
                }
                label={<Typography variant="body2">Raster Layer</Typography>}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    id="wind-particle"
                    size="small"
                    checked={activeLayerIds.includes('wind-particle')}
                    onChange={updateActiveLayerState}
                  />
                }
                label={<Typography variant="body2">Wind Layer</Typography>}
              />
            </FormGroup>
          </Box>

          <Box>
            {/* Raster Type Selection */}
            <RadioGroup
              value={smoothRasterLayerMappedAttribute}
              onChange={(e) => setSmoothRasterLayerMappedAttribute(e.target.value)}
              sx={{ '& .MuiFormControlLabel-root': { my: -0.5 } }}
            >
              <FormControlLabel value="temperature" control={<Radio size="small" />} label={<Typography variant="body2">Temperature</Typography>} />
              <FormControlLabel value="relative-humidity" control={<Radio size="small" />} label={<Typography variant="body2">Relative Humidity</Typography>} />
              <FormControlLabel value="precipitation" control={<Radio size="small" />} label={<Typography variant="body2">Precipitation</Typography>} />
            </RadioGroup>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {/* Legend Controls */}
            <Button 
              size="small" 
              variant="outlined"
              onClick={() => setWindLegendOpen(true)}
            >
              Wind Legend
            </Button>
            <Button 
              size="small"
              variant="outlined"
              onClick={() => setRasterLegendOpen(true)}
            >
              {smoothRasterLayerMappedAttribute.replace('-', ' ')} Legend
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Legend Dialogs */}
      <Dialog open={windLegendOpen} onClose={() => setWindLegendOpen(false)}>
        <DialogTitle>Wind Speed (mph)</DialogTitle>
        <DialogContent>
          <WeatherColorbar colors={weatherColorMap['wind']} />
        </DialogContent>
      </Dialog>

      <Dialog open={rasterLegendOpen} onClose={() => setRasterLegendOpen(false)}>
        <DialogTitle>
          {smoothRasterLayerMappedAttribute === 'temperature' ? 'Temperature (°F)' :
           smoothRasterLayerMappedAttribute === 'relative-humidity' ? 'Relative Humidity (%)' :
           'Precipitation (kg/m²)'}
        </DialogTitle>
        <DialogContent>
          <WeatherColorbar colors={weatherColorMap[smoothRasterLayerMappedAttribute]} />
        </DialogContent>
      </Dialog>
    </>
  )
}

export default App