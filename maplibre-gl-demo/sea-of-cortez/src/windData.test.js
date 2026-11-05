import assert from 'node:assert/strict'
import test from 'node:test'
import ExifReader from 'exifreader'
import { expandForecastUnix, gfsUrl, nearestFrameIndex } from './gfs.js'
import {
  DEFAULT_MAX_READOUT_DISTANCE_KM,
  GEBCO_MASK_LAND,
  GEBCO_MASK_NODATA,
  GEBCO_MASK_UNCERTAIN,
  GEBCO_MASK_WATER,
  embedJpegDescription,
  haversineDistanceKm,
  lookupGebcoMask,
  parseWindRanges,
  sampleNearbyWater,
  sampleWind,
  windFromComponents,
} from './windData.js'

function createMask(width, height, bounds, values) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  values.forEach((value, index) => {
    pixels[index * 4] = value
    pixels[index * 4 + 1] = value
    pixels[index * 4 + 2] = value
    pixels[index * 4 + 3] = 255
  })
  return { width, height, bounds, pixels }
}

function maskIndex(mask, longitude, latitude) {
  const [west, north, east, south] = mask.bounds
  const x = Math.floor((longitude - west) / (east - west) * mask.width)
  const y = Math.floor((north - latitude) / (north - south) * mask.height)
  return y * mask.width + x
}

function setMaskClass(mask, longitude, latitude, value) {
  const offset = maskIndex(mask, longitude, latitude) * 4
  mask.pixels.fill(value, offset, offset + 3)
}

function longitudeOffsetForDistanceKm(distanceKm, latitude) {
  const angularDistance = distanceKm / 6371.0088
  const longitudeRadians = 2 * Math.asin(Math.sin(angularDistance / 2) / Math.cos(latitude * Math.PI / 180))
  return longitudeRadians * 180 / Math.PI
}

function createReadoutFixture() {
  const grid = {
    width: 3,
    height: 3,
    bounds: [-111, 25, -110.25, 24.5],
    cellSizeDegrees: 0.25,
    ranges: { u: [-10, 10], v: [-10, 10] },
    pixels: new Uint8ClampedArray(3 * 3 * 4).fill(128),
  }
  for (let offset = 2; offset < grid.pixels.length; offset += 4) {
    grid.pixels[offset] = 255
  }

  const mask = createMask(360, 320, [-111.2, 25.2, -110.3, 24.4], new Array(360 * 320).fill(GEBCO_MASK_LAND))
  return { grid, mask }
}

test('builds NOAA forecast image URLs from a catalog timestamp', () => {
  assert.equal(gfsUrl('wind', Date.UTC(2026, 10, 4, 12) / 1000),
    'https://www.mapbox-exif-layer.com/gfs/0p25/wind/wind_2026110412.jpeg')
})

test('expands catalog hourly and three-hour forecast times', () => {
  const frames = expandForecastUnix({
    init_unix: 3600,
    hourly_until_unix: 10800,
    three_hourly_until_unix: 21600,
  })
  assert.deepEqual(frames, [3600, 7200, 10800, 21600])
  assert.equal(nearestFrameIndex(frames, 15000), 2)
})

test('parses the GFS EXIF U/V component ranges', () => {
  assert.deepEqual(
    parseWindRanges('-33.8,25.8;-27.5,33.6;0,36.1;'),
    {
      u: [-33.8, 25.8],
      v: [-27.5, 33.6],
      imageDescription: '-33.8,25.8;-27.5,33.6;0,36.1;',
    },
  )
})

test('preserves the source EXIF description in a masked JPEG texture', async () => {
  const description = '-33.8,25.8;-27.5,33.6;0,36.1;'
  const url = embedJpegDescription('data:image/jpeg;base64,/9j/2Q==', description)
  const bytes = Uint8Array.from(atob(url.split(',')[1]), (character) => character.charCodeAt(0))
  const tags = await ExifReader.load(bytes.buffer)
  assert.equal(tags.ImageDescription.description, description)
})

test('rejects missing or invalid component ranges', () => {
  assert.throws(() => parseWindRanges(''), /missing valid U\/V/)
  assert.throws(() => parseWindRanges('3,1;-2,2;0,5;'), /invalid U\/V/)
})

test('uses meteorological direction-from convention for cardinal winds', () => {
  assert.equal(windFromComponents(0, -5).direction, 0)
  assert.equal(windFromComponents(-5, 0).direction, 90)
  assert.equal(windFromComponents(0, 5).direction, 180)
  assert.equal(windFromComponents(5, 0).direction, 270)
  assert.equal(windFromComponents(0, 0).direction, null)
})

test('samples the encoded U/V components and ignores no-data pixels', () => {
  const grid = {
    width: 2,
    height: 2,
    bounds: [-180, 90, 180, -90],
    ranges: { u: [-10, 10], v: [-10, 10] },
    pixels: new Uint8ClampedArray([
      255, 128, 255, 255, 128, 128, 255, 255,
      128, 255, 0, 255, 128, 128, 255, 255,
    ]),
  }

  assert.ok(Math.abs(sampleWind(grid, -180, 90).u - 10) < 0.01)
  assert.ok(Math.abs(sampleWind(grid, -180, 90).v - 0.04) < 0.1)
  assert.equal(sampleWind(grid, -180, -90), null)
  assert.equal(sampleWind(grid, -181, 0), null)
})

test('reads categorical GEBCO water, uncertain coast, land, and NoData without interpolation', () => {
  const mask = createMask(2, 2, [0, 2, 2, 0], [
    GEBCO_MASK_WATER,
    GEBCO_MASK_UNCERTAIN,
    GEBCO_MASK_LAND,
    GEBCO_MASK_NODATA,
  ])
  assert.equal(lookupGebcoMask(mask, 0.5, 1.5), 'water')
  assert.equal(lookupGebcoMask(mask, 1.5, 1.5), 'uncertain')
  assert.equal(lookupGebcoMask(mask, 0.5, 0.5), 'land')
  assert.equal(lookupGebcoMask(mask, 1.5, 0.5), 'nodata')
  assert.equal(lookupGebcoMask(mask, 2, 1), null)
  assert.equal(lookupGebcoMask({
    width: 1,
    height: 1,
    bounds: [0, 1, 1, 0],
    pixels: new Uint8Array([GEBCO_MASK_NODATA]),
  }, 0.5, 0.5), 'nodata')
})

test('returns an exact water-cell sample distinctly from a nearby sample', () => {
  const { grid, mask } = createReadoutFixture()
  setMaskClass(mask, -110.75, 24.75, GEBCO_MASK_WATER)
  const result = sampleNearbyWater(grid, -110.75, 24.75, mask)

  assert.equal(result.status, 'at-requested-water-cell')
  assert.equal(result.requested.gebcoClass, 'water')
  assert.equal(result.sample.longitude, -110.75)
  assert.equal(result.sample.latitude, 24.75)
  assert.equal(result.sample.distanceKm, 0)
  assert.equal(result.sample.gebcoClass, 'water')
})

test('labels a nearby offshore sample from a land coordinate and reports its actual location', () => {
  const { grid, mask } = createReadoutFixture()
  setMaskClass(mask, -110.75, 24.75, GEBCO_MASK_WATER)
  const requested = { longitude: -110.85, latitude: 24.75 }
  const result = sampleNearbyWater(grid, requested.longitude, requested.latitude, mask)

  assert.equal(result.status, 'nearby-offshore-water-cell')
  assert.equal(result.requested.gebcoClass, 'land')
  assert.equal(result.sample.longitude, -110.75)
  assert.equal(result.sample.latitude, 24.75)
  assert.ok(result.sample.distanceKm > 0 && result.sample.distanceKm < DEFAULT_MAX_READOUT_DISTANCE_KM)
})

test('returns no-eligible-water status when no candidate is within 20 km', () => {
  const { grid, mask } = createReadoutFixture()
  setMaskClass(mask, -110.75, 24.5, GEBCO_MASK_WATER)
  const result = sampleNearbyWater(grid, -110.75, 24.75, mask)
  assert.equal(result.status, 'none-within-radius')
  assert.equal(result.sample, null)
})

test('accepts a water cell just inside the 20 km search boundary', () => {
  const { grid, mask } = createReadoutFixture()
  const cell = { longitude: -110.75, latitude: 24.75 }
  setMaskClass(mask, cell.longitude, cell.latitude, GEBCO_MASK_WATER)
  const requestedLongitude = cell.longitude + longitudeOffsetForDistanceKm(19.99, cell.latitude)
  const result = sampleNearbyWater(grid, requestedLongitude, cell.latitude, mask)

  assert.equal(result.status, 'nearby-offshore-water-cell')
  assert.ok(result.sample.distanceKm < DEFAULT_MAX_READOUT_DISTANCE_KM)
  assert.ok(Math.abs(result.sample.distanceKm - 19.99) < 0.01)
})

test('rejects a water cell just outside the 20 km search boundary', () => {
  const { grid, mask } = createReadoutFixture()
  const cell = { longitude: -110.75, latitude: 24.75 }
  setMaskClass(mask, cell.longitude, cell.latitude, GEBCO_MASK_WATER)
  const requestedLongitude = cell.longitude + longitudeOffsetForDistanceKm(20.01, cell.latitude)
  const result = sampleNearbyWater(grid, requestedLongitude, cell.latitude, mask)

  assert.equal(result.status, 'none-within-radius')
  assert.equal(result.sample, null)
})

test('rejects uncertain-coast and NoData cells as wind sample candidates', () => {
  for (const [label, classValue] of [
    ['uncertain coast', GEBCO_MASK_UNCERTAIN],
    ['NoData', GEBCO_MASK_NODATA],
  ]) {
    const { grid, mask } = createReadoutFixture()
    setMaskClass(mask, -110.75, 24.75, classValue)
    const result = sampleNearbyWater(grid, -110.75, 24.75, mask)

    assert.equal(result.status, 'none-within-radius', `${label} must not be sampled`)
    assert.equal(result.requested.gebcoClass, label === 'NoData' ? 'nodata' : 'uncertain')
    assert.equal(result.sample, null)
  }
})

test('rejects candidate cells when GFS and GEBCO classifications disagree', () => {
  const { grid, mask } = createReadoutFixture()
  setMaskClass(mask, -110.75, 24.75, GEBCO_MASK_WATER)
  const nativeLandSeaMask = {
    width: grid.width,
    height: grid.height,
    values: new Float32Array(9).fill(0),
  }
  nativeLandSeaMask.values[4] = 1
  const gfsLand = sampleNearbyWater(
    grid, -110.75, 24.75, mask, DEFAULT_MAX_READOUT_DISTANCE_KM, nativeLandSeaMask,
  )
  assert.equal(gfsLand.status, 'none-within-radius')

  setMaskClass(mask, -110.75, 24.75, GEBCO_MASK_LAND)
  nativeLandSeaMask.values[4] = 0
  const gebcoLand = sampleNearbyWater(
    grid, -110.75, 24.75, mask, DEFAULT_MAX_READOUT_DISTANCE_KM, nativeLandSeaMask,
  )
  assert.equal(gebcoLand.status, 'none-within-radius')
})

test('keeps missing classification data distinct from no eligible nearby sample', () => {
  const { grid } = createReadoutFixture()
  const result = sampleNearbyWater(grid, -110.75, 24.75, null)
  assert.equal(result.status, 'unavailable')
  assert.equal(result.sample, null)
})

test('returns no local sample when the requested coordinate falls outside the GEBCO raster', () => {
  const { grid, mask } = createReadoutFixture()
  const result = sampleNearbyWater(grid, -108, 24.8, mask)
  assert.equal(result.status, 'none-within-radius')
  assert.equal(result.sample, null)
})
