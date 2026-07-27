export const DISCOVERY_LOCATION_OPTIONS: PositionOptions = {
  timeout: 15_000,
  maximumAge: 60_000,
}

export type DiscoveryLocation = { lat: number; lon: number }

type GeolocationReader = Pick<Geolocation, 'getCurrentPosition'>

/**
 * Capture a field-guide coordinate without making location permission a
 * prerequisite for saving the discovery.
 */
export function captureDiscoveryLocation(
  geolocation: GeolocationReader | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.geolocation,
): Promise<DiscoveryLocation | null> {
  if (!geolocation) return Promise.resolve(null)

  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lon } = position.coords
        resolve(Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null)
      },
      () => resolve(null),
      DISCOVERY_LOCATION_OPTIONS,
    )
  })
}
