import './App.css'
import {
  MAP_STYLES,
  weatherColorMap,
  rasterLegendTitle,
  gfsUrl,
  ceilUtcHourUnix,
  fetchGfsStatus,
  expandForecastUnix,
  formatFrameLabel,
  nearestFrameIndex,
  WeatherColorbar,
  StyleToggleControl,
} from './util.jsx'
import { useRef, useEffect, useState, useMemo } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { SmoothRaster, ParticleMotion } from 'mapbox-exif-layer'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

maplibregl.setWorkerUrl(workerUrl)
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
  DialogContent,
} from '@mui/material'
import {
  SkipPrevious,
  FastRewind,
  PlayArrow,
  Pause,
  FastForward,
  SkipNext,
} from '@mui/icons-material'

const DEFAULT_BOUNDS = [-180, 90, 180, -90]

function wrapIndex(index, length) {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}

function App() {
  const mapRef = useRef()
  const mapContainerRef = useRef()

  const bootstrapUnixRef = useRef(ceilUtcHourUnix())
  const smoothRasterLayerRef = useRef(null)
  const windParticleLayerRef = useRef(null)
  if (!smoothRasterLayerRef.current) {
    const unix = bootstrapUnixRef.current
    smoothRasterLayerRef.current = new SmoothRaster({
      id: 'smooth-raster',
      source: gfsUrl('rh', unix),
      color: weatherColorMap.rh,
      opacity: 0.6,
      bounds: DEFAULT_BOUNDS,
      readyForDisplay: true,
      mapRuntime: 'maplibre',
    })
    windParticleLayerRef.current = new ParticleMotion({
      id: 'wind-particle',
      source: gfsUrl('wind', unix),
      color: weatherColorMap.wind,
      bounds: DEFAULT_BOUNDS,
      particleCount: 100000,
      unit: 'mps',
      ageThreshold: 1000,
      trailLength: 10,
      trailSizeDecay: 0.8,
      readyForDisplay: true,
      mapRuntime: 'maplibre',
    })
  }

  const smoothRasterLayerMappedAttributeRef = useRef('rh')
  const frameIndexRef = useRef(0)
  const framesRef = useRef([])
  const boundsRef = useRef(DEFAULT_BOUNDS)
  const smoothRasterLayerIsOnRef = useRef(true)
  const windParticleLayerIsOnRef = useRef(true)

  const [smoothRasterLayerMappedAttribute, setSmoothRasterLayerMappedAttribute] = useState('rh')
  const [frameIndex, setFrameIndex] = useState(0)
  const [frames, setFrames] = useState([])
  const [status, setStatus] = useState(null)
  const [statusError, setStatusError] = useState(null)
  const [activeLayerIds, setActiveLayerIds] = useState(['smooth-raster', 'wind-particle'])
  const [isPlaying, setIsPlaying] = useState(false)
  const [windLegendOpen, setWindLegendOpen] = useState(false)
  const [rasterLegendOpen, setRasterLegendOpen] = useState(false)

  const timerRef = useRef(null)

  const currentUnix = frames[frameIndex] ?? bootstrapUnixRef.current

  const sliderMarks = useMemo(() => {
    if (!status || !frames.length) return []
    const keys = ['available_from_unix', 'init_unix', 'hourly_until_unix', 'three_hourly_until_unix']
    const seen = new Set()
    const marks = []
    for (const key of keys) {
      const unix = status[key]
      if (!Number.isFinite(unix)) continue
      const value = nearestFrameIndex(frames, unix)
      if (seen.has(value)) continue
      seen.add(value)
      marks.push({ value, label: formatFrameLabel(frames[value]) })
    }
    return marks
  }, [status, frames])

  const addLayers = () => {
    if (!mapRef.current) return

    if (mapRef.current.getLayer('smooth-raster')) {
      mapRef.current.removeLayer('smooth-raster')
    }
    if (mapRef.current.getLayer('wind-particle')) {
      mapRef.current.removeLayer('wind-particle')
    }

    mapRef.current.addLayer(smoothRasterLayerRef.current)
    mapRef.current.addLayer(windParticleLayerRef.current)

    mapRef.current.setLayoutProperty(
      'smooth-raster',
      'visibility',
      smoothRasterLayerIsOnRef.current ? 'visible' : 'none',
    )
    mapRef.current.setLayoutProperty(
      'wind-particle',
      'visibility',
      windParticleLayerIsOnRef.current ? 'visible' : 'none',
    )
  }

  const applyFrameSources = (unix) => {
    if (unix == null) return
    const attribute = smoothRasterLayerMappedAttributeRef.current
    if (smoothRasterLayerRef.current) {
      smoothRasterLayerRef.current.setSource(gfsUrl(attribute, unix))
    }
    if (windParticleLayerRef.current) {
      windParticleLayerRef.current.setSource(gfsUrl('wind', unix), 0.5)
    }
  }

  const goToFrame = (index) => {
    const next = wrapIndex(index, framesRef.current.length)
    frameIndexRef.current = next
    setFrameIndex(next)
    applyFrameSources(framesRef.current[next])
  }

  const onRasterAttributeChange = (attribute) => {
    smoothRasterLayerMappedAttributeRef.current = attribute
    setSmoothRasterLayerMappedAttribute(attribute)
    const unix = framesRef.current[frameIndexRef.current] ?? bootstrapUnixRef.current
    if (unix != null && smoothRasterLayerRef.current) {
      smoothRasterLayerRef.current.setSource(
        gfsUrl(attribute, unix),
        weatherColorMap[attribute],
      )
    }
  }

  const updateActiveLayerState = (e) => {
    const layerId = e.target.id
    if (layerId === 'smooth-raster') {
      smoothRasterLayerIsOnRef.current = !smoothRasterLayerIsOnRef.current
      if (smoothRasterLayerRef.current && !smoothRasterLayerRef.current.readyForDisplay && smoothRasterLayerIsOnRef.current) {
        smoothRasterLayerRef.current.readyForDisplay = true
      }
      mapRef.current?.setLayoutProperty(
        'smooth-raster',
        'visibility',
        smoothRasterLayerIsOnRef.current ? 'visible' : 'none',
      )
    } else if (layerId === 'wind-particle') {
      windParticleLayerIsOnRef.current = !windParticleLayerIsOnRef.current
      if (windParticleLayerRef.current && !windParticleLayerRef.current.readyForDisplay && windParticleLayerIsOnRef.current) {
        windParticleLayerRef.current.readyForDisplay = true
      }
      mapRef.current?.setLayoutProperty(
        'wind-particle',
        'visibility',
        windParticleLayerIsOnRef.current ? 'visible' : 'none',
      )
    }

    if (activeLayerIds.includes(layerId)) {
      setActiveLayerIds(activeLayerIds.filter((d) => d !== layerId))
    } else {
      setActiveLayerIds([...activeLayerIds, layerId])
    }
  }

  const addMapControls = () => {
    mapRef.current.addControl(new StyleToggleControl(), 'top-right')
    mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-left')
    mapRef.current.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    mapRef.current.addControl(new maplibregl.FullscreenControl(), 'top-left')
    mapRef.current.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: [
          '© <a href="https://www.ncei.noaa.gov/products/weather-climate-models/global-forecast" target="_blank" rel="noopener">NOAA GFS</a>',
          '© <a href="https://www.mapbox-exif-layer.com/" target="_blank" rel="noopener">mapbox-exif-layer</a>',
          '© <a href="https://maplibre.org/" target="_blank" rel="noopener">MapLibre</a>',
        ],
      }),
      'bottom-right',
    )
  }

  useEffect(() => {
    let cancelled = false
    fetchGfsStatus()
      .then((doc) => {
        if (cancelled) return
        const nextFrames = expandForecastUnix(doc)
        const start = nearestFrameIndex(nextFrames, bootstrapUnixRef.current)
        framesRef.current = nextFrames
        boundsRef.current = Array.isArray(doc.bounds) ? doc.bounds : DEFAULT_BOUNDS
        frameIndexRef.current = start
        setStatus(doc)
        setFrames(nextFrames)
        setFrameIndex(start)
        setStatusError(null)
      })
      .catch((err) => {
        if (cancelled) return
        console.error(err)
        setStatusError(err.message || 'Could not load GFS status.json')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        goToFrame(frameIndexRef.current + 1)
      }, 4000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isPlaying])

  useEffect(() => {
    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: import.meta.env.VITE_MAP_STYLE ?? MAP_STYLES.dark,
      zoom: 9,
      center: [-119.699944, 34.432546],
      attributionControl: false,
    })

    mapRef.current.on('load', () => {
      addMapControls()
    })

    mapRef.current.on('style.load', () => {
      mapRef.current.setProjection({ type: 'globe' })
      addLayers()
    })

    mapRef.current.on('error', (e) => {
      console.error('Map error:', e)
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
      }
    }
  }, [])

  const stepFrame = (delta) => {
    goToFrame(frameIndexRef.current + delta)
  }

  return (
    <>
      <div id="map-container" ref={mapContainerRef} />

      {statusError && (
        <Box
          sx={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            bgcolor: 'rgba(255,230,230,0.95)',
            p: 1,
            borderRadius: 1,
            zIndex: 2,
          }}
        >
          <Typography variant="body2">{statusError}</Typography>
        </Box>
      )}

      <Box
        sx={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          bgcolor: 'rgba(255,255,255,0.9)',
          p: 1.5,
          borderRadius: 1,
          width: '90%',
          maxWidth: 640,
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        }}
      >
        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mb: 0.5 }}>
          {currentUnix != null ? formatFrameLabel(currentUnix) : 'Loading GFS…'}
          {status?.status ? ` · ${status.status}` : ''}
        </Typography>
        <Box sx={{ width: '90%', mb: 0.5, mx: 'auto' }}>
          <Slider
            sx={{ py: 0.5 }}
            size="small"
            value={frameIndex}
            min={0}
            max={Math.max(frames.length - 1, 0)}
            step={1}
            disabled={!frames.length}
            marks={sliderMarks}
            onChange={(_, value) => goToFrame(value)}
          />
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 0.5 }}>
          <IconButton size="small" disabled={!frames.length} onClick={() => stepFrame(-3)}>
            <FastRewind />
          </IconButton>
          <IconButton disabled={!frames.length} onClick={() => stepFrame(-1)}>
            <SkipPrevious />
          </IconButton>
          <IconButton disabled={!frames.length} onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>
          <IconButton disabled={!frames.length} onClick={() => stepFrame(1)}>
            <SkipNext />
          </IconButton>
          <IconButton disabled={!frames.length} onClick={() => stepFrame(3)}>
            <FastForward />
          </IconButton>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr auto',
            gap: 1,
            alignItems: 'start',
          }}
        >
          <Box>
            <FormGroup size="small" sx={{ '& .MuiFormControlLabel-root': { my: -0.5 } }}>
              <FormControlLabel
                control={
                  <Checkbox
                    id="smooth-raster"
                    size="small"
                    checked={activeLayerIds.includes('smooth-raster')}
                    onChange={updateActiveLayerState}
                  />
                }
                label={<Typography variant="body2">Raster layer</Typography>}
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
                label={<Typography variant="body2">Wind layer</Typography>}
              />
            </FormGroup>
          </Box>

          <Box>
            <RadioGroup
              value={smoothRasterLayerMappedAttribute}
              onChange={(e) => onRasterAttributeChange(e.target.value)}
              sx={{ '& .MuiFormControlLabel-root': { my: -0.5 } }}
            >
              <FormControlLabel
                value="temperature"
                control={<Radio size="small" />}
                label={<Typography variant="body2">Temperature</Typography>}
              />
              <FormControlLabel
                value="rh"
                control={<Radio size="small" />}
                label={<Typography variant="body2">Relative humidity</Typography>}
              />
            </RadioGroup>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Button size="small" variant="outlined" onClick={() => setWindLegendOpen(true)}>
              Wind legend
            </Button>
            <Button size="small" variant="outlined" onClick={() => setRasterLegendOpen(true)}>
              {smoothRasterLayerMappedAttribute === 'rh' ? 'RH' : 'Temperature'} legend
            </Button>
          </Box>
        </Box>
      </Box>

      <Dialog open={windLegendOpen} onClose={() => setWindLegendOpen(false)}>
        <DialogTitle>Wind speed (m/s)</DialogTitle>
        <DialogContent>
          <WeatherColorbar colors={weatherColorMap.wind} />
        </DialogContent>
      </Dialog>

      <Dialog open={rasterLegendOpen} onClose={() => setRasterLegendOpen(false)}>
        <DialogTitle>{rasterLegendTitle[smoothRasterLayerMappedAttribute]}</DialogTitle>
        <DialogContent>
          <WeatherColorbar colors={weatherColorMap[smoothRasterLayerMappedAttribute]} />
        </DialogContent>
      </Dialog>
    </>
  )
}

export default App
