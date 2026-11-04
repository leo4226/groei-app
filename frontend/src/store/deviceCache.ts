/**
 * A copy of the last-loaded household data, kept on this device so the app
 * can show it the moment it opens and refresh it quietly in the background.
 *
 * Without it every cold open sat on the loading screen until five API calls
 * returned, and after a few idle minutes the database first had to wake up.
 *
 * Entries are keyed by the signed-in account (and household) read from the
 * token, so one person's garden is never shown to another who signs in on
 * the same device. Everything is wiped on sign-out, on a 401 and when a new
 * session starts. Storage can be full or blocked (private mode); every access
 * fails soft, and the app then simply loads from the network as before.
 */

const PREFIX = 'floreren-cache:'
// Bump when a cached shape changes incompatibly; old entries are then ignored.
const VERSION = 1

/** `${account}-${household}` from the stored token, or null when signed out. */
export function cacheOwner(): string | null {
  try {
    const token = localStorage.getItem('floreren-token')
    if (!token) return null
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      sub?: string | number
      household_id?: number
    }
    if (json.sub === undefined || json.household_id === undefined) return null
    return `${json.sub}-${json.household_id}`
  } catch {
    return null
  }
}

function keyFor(name: string): string | null {
  const owner = cacheOwner()
  return owner ? `${PREFIX}${VERSION}:${owner}:${name}` : null
}

export function readCache<T>(name: string): T | null {
  const key = keyFor(name)
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeCache(name: string, data: unknown): void {
  const key = keyFor(name)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // Quota exceeded: drop every cached entry rather than leave a half-set,
    // and carry on without a cache.
    clearDeviceCache()
  }
}

export function clearDeviceCache(): void {
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) doomed.push(key)
    }
    for (const key of doomed) localStorage.removeItem(key)
  } catch {
    /* storage unavailable: nothing to clear */
  }
}
