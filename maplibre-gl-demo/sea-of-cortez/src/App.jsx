import { useCallback, useEffect, useRef, useState } from 'react'
import NewParticleMotion from '../../../src/NewParticleMotion.js'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import {
  ceilUtcHourUnix,
  expandForecastUnix,
  fetchGfsStatus,
  gfsUrl,
  nearestFrameIndex,
} from './gfs.js'
import {
  DEFAULT_MAX_READOUT_DISTANCE_KM,
  fetchGebcoMask,
  fetchWaterMask,
  fetchWindGrid,
  formatUtc,
  sampleNearbyWater,
  windFromComponents,
} from './windData.js'
import { fetchLatestGoesObservation } from './goes.js'

maplibregl.setWorkerUrl(workerUrl)

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark'
const START_CENTER = [-110.312, 24.142]
const OCEAN_COLOR = '#071d39'
const LAND_COLOR = '#17232d'
const WIND_COLORS = [
  [0, [126, 166, 195]],
  [3, [154, 193, 214]],
  [7, [190, 218, 231]],
  [12, [220, 234, 239]],
  [20, [239, 241, 238]],
]
const GFS_BOUNDS = [-180, 90, 180, -90]
const GEBCO_WMS = 'https://wms.gebco.net/mapserv?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=GEBCO_LATEST&STYLES=&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png'

function createSyntheticWindImage(waterMask) {
  const canvas = document.createElement('canvas')
  canvas.width = 360
  canvas.height = 181
  const context = canvas.getContext('2d')
  const image = context.createImageData(canvas.width, canvas.height)
  for (let y = 0; y < canvas.height; y += 1) {
    const latitude = 90 - y
    for (let x = 0; x < canvas.width; x += 1) {
      const longitude = x - 180
      const { u, v } = syntheticWindAt(longitude, latitude)
      const offset = (y * canvas.width + x) * 4
      const maskX = Math.round(x / (canvas.width - 1) * (waterMask.width - 1))
      const maskY = Math.round(y / (canvas.height - 1) * (waterMask.height - 1))
      const maskOffset = (maskY * waterMask.width + maskX) * 4
      image.data[offset] = Math.round((u + 12) / 24 * 255)
      image.data[offset + 1] = Math.round((v + 12) / 24 * 255)
      image.data[offset + 2] = waterMask?.pixels[maskOffset] < 128 ? 0 : 255
      image.data[offset + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.96)
}

function syntheticWindAt(longitude, latitude) {
  return {
    u: 5.2 + 2.4 * Math.sin(latitude * 0.17 + longitude * 0.08),
    v: 1.8 + 2.2 * Math.cos(longitude * 0.12 - latitude * 0.06),
  }
}

function syntheticObservation(longitude, latitude) {
  const { u, v } = syntheticWindAt(longitude, latitude)
  return windFromComponents(u, v)
}

function cardinalDirection(degrees) {
  if (degrees == null) return 'CALM'
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
    Math.round(degrees / 45) % 8
  ]
}

function addStyleLayers(map, windLayer) {
  if (!map || !map.isStyleLoaded()) return
  const styleLayers = map.getStyle().layers
  const firstSymbol = styleLayers.find((layer) => layer.type === 'symbol')?.id

  if (map.getLayer('background')) {
    map.setPaintProperty('background', 'background-color', '#06172c')
  }
  if (map.getLayer('water')) {
    map.setPaintProperty('water', 'fill-color', OCEAN_COLOR)
  }

  for (const layer of styleLayers) {
    if (layer.type === 'symbol') {
      map.setPaintProperty(layer.id, 'text-opacity', 0)
    }

    if (layer.id.startsWith('boundary_') && layer.type === 'line') {
      map.setPaintProperty(layer.id, 'line-opacity', 0.24)
    } else if (/^(road|highway|railway|aeroway)/.test(layer.id)) {
      if (layer.type === 'line') map.setPaintProperty(layer.id, 'line-opacity', 0.22)
      if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-opacity', 0.22)
      if (layer.type === 'symbol' && layer.paint?.['icon-opacity'] != null) {
        map.setPaintProperty(layer.id, 'icon-opacity', 0.2)
      }
    }
  }

  if (!map.getSource('gebco-bathymetry')) {
    map.addSource('gebco-bathymetry', {
      type: 'raster',
      tiles: [GEBCO_WMS],
      tileSize: 256,
      attribution: 'GEBCO global bathymetric grid',
    })
  }
  if (!map.getLayer('gebco-bathymetry')) {
    map.addLayer({
      id: 'gebco-bathymetry',
      type: 'raster',
      source: 'gebco-bathymetry',
      paint: {
        'raster-opacity': 0.22,
        'raster-saturation': -0.78,
        'raster-contrast': -0.06,
        'raster-fade-duration': 0,
      },
    }, firstSymbol)
  }
  if (windLayer && !map.getLayer('cortez-wind')) {
    map.addLayer(windLayer, firstSymbol)
  }
  if (!map.getSource('cortez-land-mask')) {
    map.addSource('cortez-land-mask', { type: 'geojson', data: '/land-mask.geojson' })
  }
  if (!map.getLayer('cortez-land-mask')) {
    map.addLayer({
      id: 'cortez-land-mask',
      type: 'fill',
      source: 'cortez-land-mask',
      paint: { 'fill-color': LAND_COLOR, 'fill-opacity': 0.92 },
    }, firstSymbol)
  }
  if (!map.getLayer('cortez-coastline')) {
    map.addLayer({
      id: 'cortez-coastline',
      type: 'line',
      source: 'cortez-land-mask',
      paint: { 'line-color': '#46617a', 'line-opacity': 0.72, 'line-width': 0.8 },
    }, firstSymbol)
  }
}

function App() {
  const mapRef = useRef(null)
  const mapContainerRef = useRef(null)
  const windLayerRef = useRef(null)
  const mapReadyRef = useRef(false)
  const requestIdRef = useRef(0)
  const windGridRef = useRef(null)
  const activeCloudRef = useRef(null)
  const pendingCloudRef = useRef(null)
  const cloudLayerCounterRef = useRef(0)
  const waterMaskRef = useRef(null)
  const syntheticSourceRef = useRef(null)
  const modeRef = useRef('loading')
  const frameIndexRef = useRef(0)
  const framesRef = useRef([])
  const boundsRef = useRef(GFS_BOUNDS)
  const gebcoMaskRef = useRef(null)
  const [status, setStatus] = useState(null)
  const [frames, setFrames] = useState([])
  const [frameIndex, setFrameIndex] = useState(0)
  const [mode, setMode] = useState('loading')
  const [observation, setObservation] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)

  const setModeValue = useCallback((nextMode) => {
    modeRef.current = nextMode
    setMode(nextMode)
  }, [])

  const setWindSource = useCallback((source) => {
    if (!windLayerRef.current) {
      windLayerRef.current = new NewParticleMotion({
        id: 'cortez-wind',
        source,
        color: WIND_COLORS,
        bounds: GFS_BOUNDS,
        unit: 'mps',
        velocityRange: [-12, 12],
        particleCount: navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4 ? 2100 : 3640,
        velocityFactor: 0.045,
        fadeOpacity: 0.52,
        updateInterval: 50,
        pointSize: 2.5,
        trailLength: 3,
        trailSizeDecay: 0.76,
        ageThreshold: 380,
        maxAge: 920,
        readyForDisplay: true,
        mapRuntime: 'maplibre',
      })
    } else {
      windLayerRef.current.setSource(source, 0.12)
    }
    if (mapReadyRef.current) addStyleLayers(mapRef.current, windLayerRef.current)
  }, [])

  const updateLocalObservation = useCallback((grid, longitude, latitude) => {
    const result = sampleNearbyWater(
      grid,
      longitude,
      latitude,
      gebcoMaskRef.current,
      DEFAULT_MAX_READOUT_DISTANCE_KM,
      grid?.landSeaMask ?? null,
    )
    console.debug('Tengai local wind sample:', result && {
      ...result,
      maxDistanceKm: DEFAULT_MAX_READOUT_DISTANCE_KM,
      nativeGfsMaskAvailable: Boolean(grid?.landSeaMask),
    })
    setObservation(result)
  }, [])

  const enableSyntheticMode = useCallback((message) => {
    if (!syntheticSourceRef.current) syntheticSourceRef.current = createSyntheticWindImage(waterMaskRef.current)
    const source = syntheticSourceRef.current
    windGridRef.current = null
    setWindSource(source)
    const [longitude, latitude] = mapRef.current
      ? [mapRef.current.getCenter().lng, mapRef.current.getCenter().lat]
      : START_CENTER
    setObservation(syntheticObservation(longitude, latitude))
    setModeValue('synthetic')
    setErrorMessage(message)
  }, [setModeValue, setWindSource])

  const loadFrame = useCallback(async (unixSeconds, index) => {
    if (!Number.isFinite(unixSeconds)) return
    const requestId = ++requestIdRef.current
    frameIndexRef.current = index
    const url = gfsUrl('wind', unixSeconds)
    try {
      const waterMask = waterMaskRef.current ?? await fetchWaterMask()
      waterMaskRef.current = waterMask
      const grid = await fetchWindGrid(url, boundsRef.current, waterMask)
      if (requestId !== requestIdRef.current) return
      windGridRef.current = grid
      const mapCenter = mapRef.current?.getCenter()
      updateLocalObservation(
        grid,
        mapCenter?.lng ?? START_CENTER[0],
        mapCenter?.lat ?? START_CENTER[1],
      )
      setWindSource(grid.source)
      setModeValue('forecast')
      setErrorMessage('')
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      console.error('Could not load NOAA GFS wind frame:', error)
      enableSyntheticMode('Forecast image unavailable · showing a synthetic demo field')
    }
  }, [enableSyntheticMode, setModeValue, setWindSource, updateLocalObservation])

  const goToFrame = useCallback((index) => {
    const next = Math.max(0, Math.min(index, framesRef.current.length - 1))
    if (!framesRef.current.length) return
    frameIndexRef.current = next
    setFrameIndex(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchGebcoMask()
      .then((mask) => {
        if (cancelled) return
        gebcoMaskRef.current = mask
        const grid = windGridRef.current
        const mapCenter = mapRef.current?.getCenter()
        if (grid && mapCenter) updateLocalObservation(grid, mapCenter.lng, mapCenter.lat)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('GEBCO mask unavailable; local wind readout disabled:', error)
      })

    Promise.all([fetchGfsStatus(), fetchWaterMask()])
      .then(([catalog, waterMask]) => {
        const nextFrames = expandForecastUnix(catalog)
        if (!nextFrames.length) throw new Error('The GFS status catalog did not list valid forecast times.')
        if (cancelled) return
        waterMaskRef.current = waterMask
        framesRef.current = nextFrames
        boundsRef.current = Array.isArray(catalog.bounds) ? catalog.bounds : GFS_BOUNDS
        const start = nearestFrameIndex(nextFrames, ceilUtcHourUnix())
        frameIndexRef.current = start
        setStatus(catalog)
        setFrames(nextFrames)
        setFrameIndex(start)
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Could not load the NOAA GFS status catalog:', error)
        enableSyntheticMode('Forecast feed unavailable · showing a synthetic demo field')
      })
    return () => { cancelled = true }
  }, [enableSyntheticMode, updateLocalObservation])

  useEffect(() => {
    if (!frames.length) return
    loadFrame(frames[frameIndex], frameIndex)
  }, [frames, frameIndex, loadFrame])

  useEffect(() => {
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: START_CENTER,
      zoom: 7.1,
      minZoom: 4.2,
      maxZoom: 9,
      maxBounds: [[-117.45, 21.55], [-105.05, 33.95]],
      attributionControl: false,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: [
        '<a href="https://www.ncei.noaa.gov/products/weather-climate-models/global-forecast" target="_blank" rel="noopener">NOAA GFS</a>',
        'Satellite imagery: NOAA GOES-18 ABI',
        '<a href="https://www.gebco.net/data-products/gebco-web-services/web-map-service" target="_blank" rel="noopener">GEBCO bathymetry</a>',
        '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth coastline mask</a>',
        '<a href="https://www.mapbox-exif-layer.com/" target="_blank" rel="noopener">mapbox-exif-layer</a>',
      ],
    }), 'bottom-right')

    const addMapLayers = () => {
      mapReadyRef.current = true
      addStyleLayers(map, windLayerRef.current)
    }
    map.on('load', () => {
      addMapLayers()
    })
    map.on('style.load', addMapLayers)
    map.on('moveend', () => {
      const mapCenter = map.getCenter()
      const grid = windGridRef.current
      if (grid) {
        updateLocalObservation(grid, mapCenter.lng, mapCenter.lat)
      } else if (modeRef.current === 'synthetic') {
        setObservation(syntheticObservation(mapCenter.lng, mapCenter.lat))
      }
    })
    map.on('error', (event) => {
      if (event.sourceId && pendingCloudRef.current?.sourceId === event.sourceId) {
        console.warn('GOES cloud image failed; keeping the last successful observation:', event.error?.message)
        const pending = pendingCloudRef.current
        pendingCloudRef.current = null
        if (map.getLayer(pending.layerId)) map.removeLayer(pending.layerId)
        if (map.getSource(pending.sourceId)) map.removeSource(pending.sourceId)
      }
      if (event.error) console.warn('Map layer error:', event.error.message)
    })

    return () => {
      mapReadyRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [updateLocalObservation])

  useEffect(() => {
    let cancelled = false
    let refreshTimer
    let transitionTimer
    let lastErrorAt = 0

    const removeLayerAndSource = (layer) => {
      const map = mapRef.current
      if (!map || !layer) return
      if (map.getLayer(layer.layerId)) map.removeLayer(layer.layerId)
      if (map.getSource(layer.sourceId)) map.removeSource(layer.sourceId)
    }

    const refresh = async () => {
      try {
        const { manifest, observation } = await fetchLatestGoesObservation()
        if (cancelled) return
        const ageMinutes = Math.max(
          0,
          (Date.now() - Date.parse(observation.acquisitionEnd)) / 60000,
        )
        const knownId =
          pendingCloudRef.current?.observationId ?? activeCloudRef.current?.observationId
        if (knownId === observation.id) {
          console.debug('GOES-18 cloud observation remains current:', {
            acquisitionStart: observation.acquisitionStart,
            acquisitionEnd: observation.acquisitionEnd,
            ageMinutes: Number(ageMinutes.toFixed(1)),
            lastSuccessfulUpdate: manifest.lastSuccessfulUpdate,
          })
          return
        }

        const map = mapRef.current
        if (!map || !mapReadyRef.current) return
        const suffix = ++cloudLayerCounterRef.current
        const sourceId = `goes-cloud-source-${suffix}`
        const layerId = `goes-cloud-layer-${suffix}`
        const pending = { sourceId, layerId, observationId: observation.id }
        pendingCloudRef.current = pending
        map.addSource(sourceId, {
          type: 'image',
          url: observation.image,
          coordinates: observation.coordinates,
        })
        map.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: {
            'raster-opacity': 0,
            'raster-opacity-transition': { duration: 2400, delay: 0 },
            'raster-resampling': 'linear',
            'raster-fade-duration': 0,
          },
        }, map.getLayer('cortez-wind')?.id)

        const onSourceData = (event) => {
          if (
            cancelled ||
            event.sourceId !== sourceId ||
            !event.isSourceLoaded ||
            pendingCloudRef.current?.sourceId !== sourceId
          ) return
          map.off('sourcedata', onSourceData)
          const previous = activeCloudRef.current
          activeCloudRef.current = {
            ...pending,
            acquisitionStart: observation.acquisitionStart,
            acquisitionEnd: observation.acquisitionEnd,
          }
          pendingCloudRef.current = null
          map.setPaintProperty(layerId, 'raster-opacity', 0.5)
          if (previous) {
            map.setPaintProperty(previous.layerId, 'raster-opacity', 0)
            transitionTimer = window.setTimeout(
              () => removeLayerAndSource(previous),
              2600,
            )
          }
          console.info('Rendered NOAA GOES-18 ABI cloud observation:', {
            acquisitionStart: observation.acquisitionStart,
            acquisitionEnd: observation.acquisitionEnd,
            downloadedAt: observation.downloadedAt,
            processedAt: observation.processedAt,
            lastSuccessfulUpdate: manifest.lastSuccessfulUpdate,
            ageMinutes: Number(ageMinutes.toFixed(1)),
            transition: 'opacity cross-fade between observed images only',
          })
        }
        map.on('sourcedata', onSourceData)
      } catch (error) {
        if (cancelled) return
        const now = Date.now()
        if (now - lastErrorAt > 60000) {
          console.warn('GOES-18 image unavailable; retaining the last successful cloud layer:', error)
          lastErrorAt = now
        }
      }
    }

    const map = mapRef.current
    if (mapReadyRef.current) refresh()
    else map?.once('load', refresh)
    refreshTimer = window.setInterval(refresh, 180000)
    return () => {
      cancelled = true
      map?.off('load', refresh)
      window.clearInterval(refreshTimer)
      window.clearTimeout(transitionTimer)
    }
  }, [])

  useEffect(() => {
    if (!isPlaying || !frames.length) return undefined
    const timer = window.setInterval(() => {
      if (frameIndexRef.current >= frames.length - 1) {
        setIsPlaying(false)
      } else {
        goToFrame(frameIndexRef.current + 1)
      }
    }, 3500)
    return () => window.clearInterval(timer)
  }, [frames, goToFrame, isPlaying])

  const currentUnix = frames[frameIndex] ?? null
  const windReading = mode === 'forecast' ? observation?.sample : observation
  const speed = Number.isFinite(windReading?.speed) ? windReading.speed.toFixed(1) : '—'
  const direction = windReading ? cardinalDirection(windReading.direction) : '—'
  const degrees = windReading?.direction == null ? '—' : `${Math.round(windReading.direction)}°`
  const readoutLocation = mode === 'forecast'
    ? observation?.status === 'at-requested-water-cell'
      ? 'AT REQUESTED WATER CELL'
      : observation?.status === 'nearby-water-cell'
        ? 'NEARBY WATER CELL'
        : observation?.status === 'nearby-offshore-water-cell'
          ? 'NEARBY OFFSHORE'
          : observation?.status === 'none-within-radius'
            ? 'NO WATER WITHIN 20 KM'
            : 'LOCAL SAMPLE UNAVAILABLE'
    : 'DEMO AT MAP CENTER'
  const readoutDistance = mode === 'forecast' && observation?.sample
    ? `${observation.sample.distanceKm.toFixed(1)} KM`
    : mode === 'forecast'
      ? 'N/A'
      : 'SYNTHETIC'

  return (
    <main className="scene">
      <div className="map" ref={mapContainerRef} />
      <header className="masthead">
        <div className="brand-mark" aria-hidden="true"><span /></div>
        <div>
          <p className="eyebrow">TENGAI · MARINE ATMOSPHERE</p>
          <h1>Sea of Cortez</h1>
        </div>
        <div className={`forecast-badge ${mode}`}>
          <span className="status-dot" />
          {mode === 'forecast' ? 'GFS FORECAST' : mode === 'synthetic' ? 'DEMO FIELD' : 'CONNECTING'}
        </div>
      </header>

      <aside className="conditions-panel" aria-live="polite">
        <div className="panel-heading">
          <span className="panel-label">10 M WIND</span>
          <span className="panel-mark">M/S</span>
        </div>
        <div className="wind-reading">
          <span className="wind-speed">{speed}</span>
          <span className="wind-unit">m/s</span>
        </div>
        <div className="direction-reading">
          <span>{direction}</span><span className="muted">·</span><span className="muted">{degrees}</span>
        </div>
        <div className="panel-divider" />
        <div className="readout-meta">
          <span>{readoutLocation}</span>
          <span>{readoutDistance}</span>
        </div>
        <p className="disclaimer">Forecast visualization only · not for navigation</p>
      </aside>

      <section className="timeline" aria-label="Forecast timeline">
        <div className="timeline-topline">
          <div className="time-copy">
            <span className="panel-label">{mode === 'synthetic' ? 'FALLBACK DEMO' : 'FORECAST VALID'}</span>
            <strong>{currentUnix ? formatUtc(currentUnix, { date: true }) : 'Awaiting forecast'}</strong>
          </div>
          <button
            className="play-button"
            type="button"
            disabled={!frames.length}
            aria-label={isPlaying ? 'Pause forecast animation' : 'Play forecast animation'}
            onClick={() => setIsPlaying((playing) => !playing)}
          >
            {isPlaying ? 'Ⅱ' : '▶'}
          </button>
        </div>
        <input
          aria-label="Forecast valid time"
          type="range"
          min="0"
          max={Math.max(frames.length - 1, 0)}
          value={frameIndex}
          disabled={!frames.length}
          onChange={(event) => goToFrame(Number(event.target.value))}
          style={{ '--range-progress': `${frames.length > 1 ? frameIndex / (frames.length - 1) * 100 : 0}%` }}
        />
        <div className="timeline-bottomline">
          <span>NOAA GFS · 0.25°</span>
          <span>INITIALIZED {status ? formatUtc(status.init_unix, { date: true }) : '—'}</span>
          <span>{frames.length ? `${frames.length} forecast times` : 'SYNTHETIC DEMO'}</span>
        </div>
        {errorMessage && <p className="fallback-note">{errorMessage}</p>}
      </section>

      <div className="map-caption">
        <span className="flow-key" />
        <span>10 m wind flow</span>
        <span className="caption-separator">·</span>
        <span>GOES-18 atmosphere</span>
        <span className="caption-separator">·</span>
        <span>Bathymetry · GEBCO</span>
        <span className="caption-separator">·</span>
        <span>NOAA GFS · 0.25°</span>
      </div>
      <div className="compass" aria-hidden="true"><span>N</span><i>↑</i></div>
    </main>
  )
}

export default App
