export const CARE_RHYTHM_CHANGED_EVENT = 'floreren-care-rhythm-changed'

export function notifyCareRhythmChanged(): void {
  window.dispatchEvent(new Event(CARE_RHYTHM_CHANGED_EVENT))
}
