/** What to show a person when an API call fails.
 *
 * A thrown error's message is the server's `detail` (English, or a JSON dump
 * of a validation error) or the browser's "Failed to fetch": text for logs,
 * not for a Dutch-speaking gardener. The screen shows its own translated
 * message; the raw error goes to the console for whoever debugs it.
 */
export function userFacingError(e: unknown, fallback: string): string {
  console.warn(e)
  return fallback
}
