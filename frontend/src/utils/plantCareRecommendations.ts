import type { CareWarningOut } from '../types'

function localizedWarningAction(warning: CareWarningOut, locale: string): string | null {
  const action = locale.startsWith('en') ? warning.action_en : warning.action_nl
  return action?.trim() || null
}

export function careTypeFromActionText(action: string): string | null {
  const text = action.toLowerCase()
  if (/\b(fertili[sz]e|feed)\b|bemest|voeding|mest/.test(text)) return 'fertilize'
  if (/\bwater\b|geef .*water|water geven|bewater/.test(text)) return 'water'
  if (/\b(prune|snoei)/.test(text)) return 'prune'
  if (/\b(repot|verpot)/.test(text)) return 'repot'
  if (/\b(rotate|draai)/.test(text)) return 'rotate'
  if (/\b(mist|sproei|besproei|bevochtig)/.test(text)) return 'mist'
  return null
}

export function buildPlantDetailActions(
  warnings: CareWarningOut[],
  phenologyActions: string[],
  locale: string,
): string[] {
  const warningCareTypes = new Set(warnings.map(w => w.care_type))
  const result: string[] = []
  const seen = new Set<string>()

  function add(action: string) {
    const trimmed = action.trim()
    if (!trimmed) return
    const key = trimmed.toLocaleLowerCase(locale)
    if (seen.has(key)) return
    seen.add(key)
    result.push(trimmed)
  }

  for (const warning of warnings) {
    const action = localizedWarningAction(warning, locale)
    if (action) add(action)
  }

  for (const action of phenologyActions) {
    const actionCareType = careTypeFromActionText(action)
    if (actionCareType && warningCareTypes.has(actionCareType)) continue
    add(action)
  }

  return result
}
