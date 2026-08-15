import { describe, it, expect } from 'vitest'
import { nl } from '../nl'
import { en } from '../en'

/**
 * Guards the 2026-08 settings restructure, following the pattern in
 * editorBaseline.test.ts: the i18n ignore list must only shrink, and "both
 * languages present" is not the same as "actually translated".
 */

// Settings.tsx was on the baseline when the guard shipped. The restructure
// translated it, so it must never come back.
const TRANSLATED_SETTINGS_FILES = ['src/pages/Settings.tsx']

const CONFIG_SOURCE = Object.values(
  import.meta.glob('../../../eslint.i18n.config.js', { eager: true, query: '?raw', import: 'default' }),
)[0] as string

describe('settings i18n baseline', () => {
  it('does not re-admit Settings.tsx to the ignore list', () => {
    // Guard the guard: an empty read would make the assertion below vacuous.
    expect(CONFIG_SOURCE).toContain('no-literal-string')
    const readmitted = TRANSLATED_SETTINGS_FILES.filter((f) => CONFIG_SOURCE.includes(`'${f}'`))
    expect(readmitted).toEqual([])
  })

  it('never admits the new settings panels', () => {
    // These were written after the guard existed, so they were never exempt —
    // this stops someone silencing them instead of translating a new string.
    const panels = [
      'src/pages/settings/YouPanel.tsx',
      'src/pages/settings/HouseholdPanel.tsx',
      'src/pages/settings/NotificationsPanel.tsx',
      'src/pages/settings/PlacesPanel.tsx',
      'src/pages/settings/AppDataPanel.tsx',
      'src/components/settings/SettingsGroup.tsx',
    ]
    expect(panels.filter((f) => CONFIG_SOURCE.includes(`'${f}'`))).toEqual([])
  })
})

describe('settings catalog parity', () => {
  // Strings that were hardcoded before the restructure — one language only,
  // whichever the developer happened to be typing in that day.
  const PREVIOUSLY_HARDCODED = [
    'profileLoadError',    // was English: 'Failed to load profile'
    'membersLoadError',    // was English: 'Failed to load members'
    'inviteError',         // was Dutch:   'Fout bij genereren code'
    'adminPanel',          // was English: 'Admin panel →'
    'assistantDescription',
    'logoutConfirm',
  ] as const

  it.each(PREVIOUSLY_HARDCODED)('%s differs between nl and en', (key) => {
    const dutch = nl.settings[key]
    const english = en.settings[key]
    expect(dutch).toBeTruthy()
    expect(english).toBeTruthy()
    expect(english).not.toBe(dutch)
  })

  it('gives every accordion group a title in both languages', () => {
    const groups = [
      'groupYou', 'groupHousehold', 'groupCare',
      'groupNotifications', 'groupPlaces', 'groupApp', 'groupAdmin',
    ] as const
    for (const g of groups) {
      expect(nl.settings[g]).toBeTruthy()
      expect(en.settings[g]).toBeTruthy()
    }
  })

  it('keeps the interpolation placeholders in both languages', () => {
    // These are .replace()d at the call site; losing the token in one language
    // silently drops the name or count from the sentence.
    const interpolated = [
      ['memberCountMany', '{count}'],
      ['locationCountMany', '{count}'],
      ['digestOnAt', '{time}'],
      ['editMember', '{name}'],
      ['removeConfirmNamed', '{name}'],
      ['confirmDeleteLocationNamed', '{name}'],
      ['deleteLocationNamed', '{name}'],
      ['renameNamed', '{name}'],
      ['removeMemberNamed', '{name}'],
    ] as const
    for (const [key, token] of interpolated) {
      expect(nl.settings[key]).toContain(token)
      expect(en.settings[key]).toContain(token)
    }
  })

  it('describes both push states, so a collapsed group is never ambiguous', () => {
    expect(nl.settings.pushOn).not.toBe(nl.settings.pushOff)
    expect(en.settings.pushOn).not.toBe(en.settings.pushOff)
    expect(nl.settings.digestOff).not.toBe(nl.settings.digestOnAt)
  })
})
