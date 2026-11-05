import ExifReader from 'exifreader'

const IMAGE_DESCRIPTION_PATTERN =
  /^\s*(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?);(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?);(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?);?\s*$/

export const GEBCO_MASK_WATER = 255
export const GEBCO_MASK_UNCERTAIN = 128
export const GEBCO_MASK_LAND = 0
export const GEBCO_MASK_NODATA = 64
export const GEBCO_MASK_URL = '/gebco-classification.png'
export const GEBCO_MASK_METADATA_URL = '/gebco-classification.json'
export const GFS_GRID_STEP_DEGREES = 0.25
export const DEFAULT_MAX_READOUT_DISTANCE_KM = 20

export function parseWindRanges(description) {
  const match = IMAGE_DESCRIPTION_PATTERN.exec(description ?? '')
  if (!match) {
    throw new Error('Wind image is missing valid U/V component metadata.')
  }

  const values = match.slice(1).map(Number)
  if (!values.every(Number.isFinite) || values[1] <= values[0] || values[3] <= values[2]) {
    throw new Error('Wind image contains invalid U/V component ranges.')
  }

  return {
    u: [values[0], values[1]],
    v: [values[2], values[3]],
    imageDescription: description,
  }
}

export function embedJpegDescription(dataUrl, description) {
  const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const jpeg = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
  const text = new TextEncoder().encode(`${description}\0`)
  const tiff = new Uint8Array(26 + text.length)
  const view = new DataView(tiff.buffer)
  tiff.set([0x49, 0x49, 42, 0, 8, 0, 0, 0])
  view.setUint16(8, 1, true)
  view.setUint16(10, 0x010e, true)
  view.setUint16(12, 2, true)
  view.setUint32(14, text.length, true)
  view.setUint32(18, 26, true)
  view.setUint32(22, 0, true)
  tiff.set(text, 26)

  const exif = new Uint8Array(6 + tiff.length)
  exif.set([0x45, 0x78, 0x69, 0x66, 0, 0])
  exif.set(tiff, 6)
  const segmentLength = exif.length + 2
  const segment = new Uint8Array(exif.length + 4)
  segment.set([0xff, 0xe1, segmentLength >> 8, segmentLength & 0xff])
  segment.set(exif, 4)
  const result = new Uint8Array(jpeg.length + segment.length)
  result.set(jpeg.subarray(0, 2))
  result.set(segment, 2)
  result.set(jpeg.subarray(2), 2 + segment.length)
  let binary = ''
  for (let offset = 0; offset < result.length; offset += 0x8000) {
    binary += String.fromCharCode(...result.subarray(offset, offset + 0x8000))
  }
  return `data:image/jpeg;base64,${btoa(binary)}`
}

export function windFromComponents(u, v) {
  const speed = Math.hypot(u, v)
  const direction = speed < 0.05
    ? null
    : ((Math.atan2(-u, -v) * 180 / Math.PI) + 360) % 360
  return { u, v, speed, direction }
}

export async function fetchGebcoMask(
  url = GEBCO_MASK_URL,
  metadataUrl = GEBCO_MASK_METADATA_URL,
) {
  const [imageResponse, metadataResponse] = await Promise.all([fetch(url), fetch(metadataUrl)])
  if (!imageResponse.ok) throw new Error(`GEBCO mask HTTP ${imageResponse.status}`)
  if (!metadataResponse.ok) throw new Error(`GEBCO mask metadata HTTP ${metadataResponse.status}`)
  const metadata = await metadataResponse.json()
  const bitmap = await createImageBitmap(await imageResponse.blob())
  try {
    if (bitmap.width !== metadata.width || bitmap.height !== metadata.height) {
      throw new Error('GEBCO mask dimensions do not match its metadata.')
    }
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Could not create a canvas to read the GEBCO mask.')
    context.drawImage(bitmap, 0, 0)
    const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    const pixels = new Uint8Array(bitmap.width * bitmap.height)
    for (let index = 0; index < pixels.length; index += 1) {
      pixels[index] = rgba[index * 4]
    }
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels,
      bounds: metadata.bounds,
      thresholdMeters: metadata.threshold_meters,
    }
  } finally {
    bitmap.close()
  }
}

export function lookupGebcoMask(mask, longitude, latitude) {
  if (!mask || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  const [west, north, east, south] = mask.bounds
  if (longitude < west || longitude >= east || latitude <= south || latitude > north) return null
  const x = Math.floor((longitude - west) / (east - west) * mask.width)
  const y = Math.floor((north - latitude) / (north - south) * mask.height)
  const index = y * mask.width + x
  const classValue = mask.pixels.length === mask.width * mask.height
    ? mask.pixels[index]
    : mask.pixels[index * 4]
  if (classValue === GEBCO_MASK_WATER) return 'water'
  if (classValue === GEBCO_MASK_UNCERTAIN) return 'uncertain'
  if (classValue === GEBCO_MASK_LAND) return 'land'
  if (classValue === GEBCO_MASK_NODATA) return 'nodata'
  return null
}

export function haversineDistanceKm(longitude1, latitude1, longitude2, latitude2) {
  const radians = Math.PI / 180
  const lat1 = latitude1 * radians
  const lat2 = latitude2 * radians
  const deltaLat = (latitude2 - latitude1) * radians
  const deltaLon = ((((longitude2 - longitude1) + 540) % 360) - 180) * radians
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  const boundedHaversine = Math.min(1, Math.max(0, haversine))
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine))
}

function sampleWindCell(grid, x, y, longitude, latitude) {
  if (x < 0 || x >= grid.width || y < 0 || y >= grid.height) return null
  const offset = (y * grid.width + x) * 4
  if (grid.pixels[offset + 2] < 128) return null
  const u = grid.ranges.u[0] + grid.pixels[offset] / 255 * (grid.ranges.u[1] - grid.ranges.u[0])
  const v = grid.ranges.v[0] + grid.pixels[offset + 1] / 255 * (grid.ranges.v[1] - grid.ranges.v[0])
  return { ...windFromComponents(u, v), longitude, latitude }
}

function validateNativeLandSeaMask(mask, grid) {
  if (!mask) return
  if (
    mask.width !== grid.width ||
    mask.height !== grid.height ||
    !mask.values ||
    mask.values.length !== grid.width * grid.height
  ) {
    throw new Error('Native GFS land-sea mask dimensions do not match the wind grid.')
  }
}

export function sampleNearbyWater(
  grid,
  longitude,
  latitude,
  gebcoMask,
  maxDistanceKm = DEFAULT_MAX_READOUT_DISTANCE_KM,
  nativeLandSeaMask = null,
) {
  if (!grid || !gebcoMask) {
    return {
      status: 'unavailable',
      requested: { longitude, latitude, gebcoClass: null },
      sample: null,
    }
  }
  if (!Number.isFinite(maxDistanceKm) || maxDistanceKm < 0) return null
  const requestedClass = lookupGebcoMask(gebcoMask, longitude, latitude)
  const requested = { longitude, latitude, gebcoClass: requestedClass }
  if (requestedClass == null) {
    return { status: 'none-within-radius', requested, sample: null }
  }
  validateNativeLandSeaMask(nativeLandSeaMask, grid)
  const [west, north, east, south] = grid.bounds
  const stepX = grid.cellSizeXDegrees ?? grid.cellSizeDegrees ?? (east - west) / grid.width
  const stepY = grid.cellSizeYDegrees ?? grid.cellSizeDegrees ?? (north - south) / (grid.height - 1)
  const lonRadius = maxDistanceKm / (111.195 * Math.max(Math.cos(latitude * Math.PI / 180), 0.01))
  const latRadius = maxDistanceKm / 110.574
  const centerX = Math.round((longitude - west) / stepX)
  const centerY = Math.round((north - latitude) / stepY)
  const radiusX = Math.ceil(lonRadius / stepX) + 1
  const radiusY = Math.ceil(latRadius / stepY) + 1
  let nearest = null

  for (let y = centerY - radiusY; y <= centerY + radiusY; y += 1) {
    const sampleLatitude = north - y * stepY
    if (sampleLatitude < south || sampleLatitude > north) continue
    for (let x = centerX - radiusX; x <= centerX + radiusX; x += 1) {
      const sampleLongitude = west + x * stepX
      if (sampleLongitude < west || sampleLongitude >= east) continue
      const gebcoClass = lookupGebcoMask(gebcoMask, sampleLongitude, sampleLatitude)
      if (gebcoClass !== 'water') continue
      const nativeOffset = y * grid.width + x
      const modelLandFraction = nativeLandSeaMask?.values[nativeOffset]
      if (
        nativeLandSeaMask &&
        (!Number.isFinite(modelLandFraction) ||
          modelLandFraction > (nativeLandSeaMask.maxWaterFraction ?? 0.5))
      ) {
        continue
      }
      const distanceKm = haversineDistanceKm(longitude, latitude, sampleLongitude, sampleLatitude)
      if (distanceKm > maxDistanceKm || (nearest && distanceKm >= nearest.distanceKm)) continue
      const observation = sampleWindCell(grid, x, y, sampleLongitude, sampleLatitude)
      if (observation) {
        nearest = {
          ...observation,
          distanceKm,
          gebcoClass,
          modelLandFraction: nativeLandSeaMask ? modelLandFraction : null,
        }
      }
    }
  }
  if (!nearest) return { status: 'none-within-radius', requested, sample: null }

  const status = nearest.distanceKm === 0 && requestedClass === 'water'
    ? 'at-requested-water-cell'
    : requestedClass === 'water'
      ? 'nearby-water-cell'
      : 'nearby-offshore-water-cell'

  return { status, requested, sample: nearest }
}

export async function fetchWaterMask(url = '/wind-water-mask.png') {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Land mask HTTP ${response.status}`)
  const bitmap = await createImageBitmap(await response.blob())
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Could not create a canvas to read the land mask.')
    context.drawImage(bitmap, 0, 0)
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
    }
  } finally {
    bitmap.close()
  }
}

export function sampleWind(grid, longitude, latitude) {
  const [west, north, east, south] = grid.bounds
  if (
    longitude < west || longitude > east ||
    latitude < south || latitude > north
  ) {
    return null
  }

  const x = Math.round((longitude - west) / (east - west) * (grid.width - 1))
  const y = Math.round((north - latitude) / (north - south) * (grid.height - 1))
  const offset = (y * grid.width + x) * 4
  if (grid.pixels[offset + 2] < 128) return null

  const u = grid.ranges.u[0] + grid.pixels[offset] / 255 * (grid.ranges.u[1] - grid.ranges.u[0])
  const v = grid.ranges.v[0] + grid.pixels[offset + 1] / 255 * (grid.ranges.v[1] - grid.ranges.v[0])
  return windFromComponents(u, v)
}

export async function fetchWindGrid(url, bounds, waterMask) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Wind forecast image HTTP ${response.status}`)
  }

  const buffer = await response.arrayBuffer()
  const tags = await ExifReader.load(buffer)
  const ranges = parseWindRanges(tags.ImageDescription?.description)
  const bitmap = await createImageBitmap(new Blob([buffer], { type: 'image/jpeg' }))
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Could not create a canvas to sample the wind forecast.')
    context.drawImage(bitmap, 0, 0)
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data
    if (waterMask) {
      if (waterMask.width !== bitmap.width || waterMask.height !== bitmap.height) {
        throw new Error(`Land mask dimensions ${waterMask.width}×${waterMask.height} do not match wind grid ${bitmap.width}×${bitmap.height}.`)
      }
      for (let offset = 0, maskOffset = 0; offset < pixels.length; offset += 4, maskOffset += 4) {
        if (waterMask.pixels[maskOffset] < 128) pixels[offset + 2] = 0
      }
      const maskedImage = context.createImageData(bitmap.width, bitmap.height)
      maskedImage.data.set(pixels)
      context.putImageData(maskedImage, 0, 0)
    }
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels,
      cellSizeDegrees: GFS_GRID_STEP_DEGREES,
      source: embedJpegDescription(
        context.canvas.toDataURL('image/jpeg', 0.96),
        ranges.imageDescription,
      ),
      bounds,
      ranges,
    }
  } finally {
    bitmap.close()
  }
}

export function formatUtc(unixSeconds, { date = false } = {}) {
  if (!Number.isFinite(unixSeconds)) return '—'
  return new Intl.DateTimeFormat('en', {
    timeZone: 'UTC',
    ...(date ? { weekday: 'short', month: 'short', day: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(unixSeconds * 1000)) + ' UTC'
}
