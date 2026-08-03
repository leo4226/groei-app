/**
 * Retry transient network failures.
 *
 * `fetch` rejects with a TypeError when the request never completed at the
 * transport level — DNS, TLS, connection reset, or (our common case) the Fly
 * machine cold-starting because `min_machines_running = 0`. A failed request
 * has no response to read, so browsers surface it as "NetworkError" or even
 * "CORS request did not succeed" with a null status, which reads like a
 * misconfiguration but is really just a backend that was still waking up.
 *
 * An HTTP error (401, 500, …) is a *response* and is never retried here — the
 * caller decides what a status means.
 */
export async function withNetworkRetry<T>(run: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await run()
    } catch (e) {
      const isNetworkError = e instanceof TypeError
      if (!isNetworkError || attempt === maxRetries) throw e
      lastError = e
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000))
    }
  }

  throw lastError
}
