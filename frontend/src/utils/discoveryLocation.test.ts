import { describe, expect, it, vi } from 'vitest'

import {
  DISCOVERY_LOCATION_OPTIONS,
  captureDiscoveryLocation,
} from './discoveryLocation'

describe('captureDiscoveryLocation', () => {
  it('retains a slow GPS fix with the journal-safe timeout', async () => {
    let resolvePosition: PositionCallback | undefined
    const geolocation = {
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        resolvePosition = success
      }),
    } as unknown as Geolocation

    const locationPromise = captureDiscoveryLocation(geolocation)

    expect(geolocation.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      DISCOVERY_LOCATION_OPTIONS,
    )

    resolvePosition?.({
      coords: { latitude: 38.7223, longitude: -9.1393 },
    } as GeolocationPosition)

    await expect(locationPromise).resolves.toEqual({ lat: 38.7223, lon: -9.1393 })
  })

  it('keeps the journal usable when the browser denies or cannot provide location', async () => {
    const geolocation = {
      getCurrentPosition: vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 1, message: 'Permission denied' } as GeolocationPositionError)
      }),
    } as unknown as Geolocation

    await expect(captureDiscoveryLocation(geolocation)).resolves.toBeNull()
    await expect(captureDiscoveryLocation(undefined)).resolves.toBeNull()
  })
})
