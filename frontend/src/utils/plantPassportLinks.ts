export const PLANT_PASSPORT_ANCHORS = {
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
