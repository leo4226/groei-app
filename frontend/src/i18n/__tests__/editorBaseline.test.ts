import { describe, it, expect } from 'vitest'
import { nl } from '../nl'
import { en } from '../en'

// The i18n guard's ignore list is a baseline of pre-existing offenders, and
// CLAUDE.md says it must only ever shrink. Nothing enforced that: a file could
// be added back and CI would stay green. These are the editor files this change
// translated — the screen a new user has to finish before the app does anything.
const TRANSLATED_EDITOR_FILES = [
  'src/components/editor/DimensionArrows.tsx',
  'src/components/editor/EditorCanvas.tsx',
  'src/components/editor/ObjectPropertiesPanel.tsx',
  'src/components/editor/WallElementPropertiesPanel.tsx',
  'src/components/editor/ZonePropertiesPanel.tsx',
  'src/pages/LayoutEditorPage.tsx',
]

// The config is plain JS with no type declarations and the app tsconfig has no
// allowJs, so read it as text rather than importing it.
const CONFIG_SOURCE = Object.values(
  import.meta.glob('../../../eslint.i18n.config.js', { eager: true, query: '?raw', import: 'default' }),
)[0] as string

describe('i18n baseline', () => {
  it('does not re-admit the editor files it just translated', () => {
    // Guard the guard: an empty read would make the assertion below vacuous.
    expect(CONFIG_SOURCE).toContain('no-literal-string')
    const readmitted = TRANSLATED_EDITOR_FILES.filter((f) => CONFIG_SOURCE.includes(`'${f}'`))
    expect(readmitted).toEqual([])
  })
})

describe('editor catalog parity', () => {
  // The Translations type already forces en/nl to have the same keys. What it
  // cannot catch is a "translation" that is just the Dutch string copied over,
  // which is what an English user actually sees.
  const SHOULD_DIFFER: [string, string][] = [
    ['props.material', 'Materiaal'],
    ['props.materialWood', 'Hout'],
    ['props.materialBrick', 'Steen'],
    ['props.soilNote', 'Bodemnotitie'],
    ['props.cornerCutOpen', 'Hoek afsnijden…'],
    ['props.type', 'Type'],   // identical in both languages — the control case
    ['viewMap', 'Bekijken →'],
    ['more', 'Meer'],
    ['tourAction', 'Rondleiding'],
    ['offCanvas', 'Buiten canvas'],
    ['sunPerimeterShow', 'Toon zon-perimeter'],
  ]

  const get = (pack: typeof nl, path: string) =>
    path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], pack.editor)

  it.each(SHOULD_DIFFER)('%s carries the expected Dutch string', (path, dutch) => {
    expect(get(nl, path)).toBe(dutch)
  })

  it('never shows a Dutch editor string to an English account', () => {
    const dutchInEnglish = SHOULD_DIFFER
      .filter(([, dutch]) => dutch !== 'Type')   // genuinely the same word
      .filter(([path, dutch]) => get(en, path) === dutch)
    expect(dutchInEnglish).toEqual([])
  })

  it('translates the wall edges that were rendered as raw identifiers', () => {
    // element.edge is 'top' | 'right' | 'bottom' | 'left' and was printed as-is.
    expect(nl.editor.props.edges).toEqual({ top: 'Boven', right: 'Rechts', bottom: 'Onder', left: 'Links' })
    expect(en.editor.props.edges.top).toBe('Top')
  })

  it('keeps the interpolated strings interpolating in both languages', () => {
    expect(nl.editor.shadowCasterList(3)).toContain('3')
    expect(en.editor.shadowCasterList(3)).toContain('3')
    expect(nl.editor.props.scaleReadout(46, 400, 260)).toContain('46')
    expect(en.editor.props.scaleReadout(46, 400, 260)).toContain('400')
    expect(nl.editor.props.edgePosition('Boven', 50)).toContain('50')
    expect(en.editor.props.edgePosition('Top', 50)).toContain('Top')
  })
})
