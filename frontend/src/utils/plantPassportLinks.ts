export const PLANT_PASSPORT_ANCHORS = {
  care: 'care-schedules',
  careHistory: 'care-history',
  photoJournal: 'photo-journal',
} as const

const PLANT_PASSPORT_ANCHOR_IDS = new Set<string>(Object.values(PLANT_PASSPORT_ANCHORS))
const CARE_LOG_ANCHOR_PATTERN = /^care-log-\d+$/

export function careLogAnchor(careLogId: number): string {
  return `care-log-${careLogId}`
}

export function resolvePlantPassportAnchor(
  hash: string,
  root: Document = document,
): HTMLElement | null {
  const id = hash.startsWith('#') ? hash.slice(1) : hash
  if (!PLANT_PASSPORT_ANCHOR_IDS.has(id) && !CARE_LOG_ANCHOR_PATTERN.test(id)) return null
  return root.getElementById(id)
}

/**
 * Hash that opens the edit form on its care card.
 *
 * The passport links here instead of carrying its own add/remove controls: the
 * same write was reachable two ways, silently in the form and behind a
 * `window.confirm` in the passport (#886 §4.1). On a phone the card is
 * collapsed by default, so the form opens it when it sees this hash.
 */
export const EDIT_PLANT_CARE_HASH = '#care'
