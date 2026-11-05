import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchLatestGoesObservation } from './goes.js'

const observation = {
  id: 'OR_ABI-L2-MCMIPF-G18-test.nc',
  satellite: 'GOES-18',
  product: 'ABI-L2-MCMIPF',
  acquisitionStart: '2026-11-05T01:00:21.8Z',
  acquisitionEnd: '2026-11-05T01:09:53.2Z',
  image: '/goes/observation.png',
  coordinates: [[-113.5, 29], [-107, 29], [-107, 22], [-113.5, 22]],
}

test('accepts a timestamped GOES-18 ABI observation from the cache manifest', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (_url, options) => {
    assert.deepEqual(options, { cache: 'no-store' })
    return new Response(JSON.stringify({
      satellite: 'GOES-18',
      product: 'ABI-L2-MCMIPF',
      observations: [observation],
    }))
  }

  try {
    const result = await fetchLatestGoesObservation()
    assert.equal(result.observation.id, observation.id)
    assert.equal(result.observation.acquisitionStart, '2026-11-05T01:00:21.8Z')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rejects a cache manifest with missing or malformed geographic coordinates', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    satellite: 'GOES-18',
    product: 'ABI-L2-MCMIPF',
    observations: [{ ...observation, coordinates: [[0, 0]] }],
  }))

  try {
    await assert.rejects(fetchLatestGoesObservation(), /valid latest observation/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
