export const GOES_MANIFEST_URL = '/goes/manifest.json'

export async function fetchLatestGoesObservation(url = GOES_MANIFEST_URL) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`GOES observation manifest HTTP ${response.status}`)
  const manifest = await response.json()
  const observation = manifest.observations?.[0]
  if (
    manifest.satellite !== 'GOES-18' ||
    manifest.product !== 'ABI-L2-MCMIPF' ||
    !observation ||
    observation.satellite !== 'GOES-18' ||
    observation.product !== 'ABI-L2-MCMIPF' ||
    typeof observation.id !== 'string' ||
    typeof observation.image !== 'string' ||
    !Number.isFinite(Date.parse(observation.acquisitionStart)) ||
    !Number.isFinite(Date.parse(observation.acquisitionEnd)) ||
    !Array.isArray(observation.coordinates) ||
    observation.coordinates.length !== 4 ||
    observation.coordinates.some(
      (coordinate) =>
        !Array.isArray(coordinate) ||
        coordinate.length !== 2 ||
        !coordinate.every(Number.isFinite),
    )
  ) {
    throw new Error('GOES observation manifest does not contain a valid latest observation.')
  }
  return { manifest, observation }
}
