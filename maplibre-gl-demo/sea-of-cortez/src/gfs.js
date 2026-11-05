const GFS_BASE = 'https://www.mapbox-exif-layer.com/gfs/0p25'

export function gfsUrl(variable, unixSeconds) {
  const compact = new Date(unixSeconds * 1000).toISOString().slice(0, 13).replace(/[-T]/g, '')
  return `${GFS_BASE}/${variable}/${variable}_${compact}.jpeg`
}

export async function fetchGfsStatus() {
  const response = await fetch(`${GFS_BASE}/status.json`)
  if (!response.ok) throw new Error(`GFS status catalog HTTP ${response.status}`)
  const status = await response.json()
  if (!Array.isArray(status.variables) || !status.variables.includes('wind')) {
    throw new Error('The GFS status catalog does not list wind data.')
  }
  return status
}

export function expandForecastUnix(status) {
  const { init_unix: start, hourly_until_unix: hourlyEnd, three_hourly_until_unix: end } = status
  if (![start, hourlyEnd, end].every(Number.isFinite) || start > hourlyEnd || hourlyEnd > end) {
    return []
  }

  const frames = []
  for (let time = start; time <= hourlyEnd; time += 3600) frames.push(time)
  for (let time = hourlyEnd + 10800; time <= end; time += 10800) frames.push(time)
  return frames
}

export function nearestFrameIndex(frames, unixSeconds) {
  if (!frames.length) return 0
  let bestIndex = 0
  for (let index = 1; index < frames.length; index += 1) {
    if (Math.abs(frames[index] - unixSeconds) < Math.abs(frames[bestIndex] - unixSeconds)) {
      bestIndex = index
    }
  }
  return bestIndex
}

export function ceilUtcHourUnix() {
  return Math.ceil(Date.now() / 3600000) * 3600
}
