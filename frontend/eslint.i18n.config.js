// i18n guard — the ONLY rule here is i18next/no-literal-string, so this config
// stays green independently of the (pre-existing) debt in the main lint.
//
// Why: the 2026-07 language audit traced every Dutch/English mixing bug to
// user-facing strings that never entered the typed translation catalog
// (frontend/src/i18n). The Translations type already guarantees en.ts and
// nl.ts stay in sync — this rule guarantees strings actually GO through it.
//
// Run with: npm run lint:i18n   (CI runs it in the frontend job)
//
// markupOnly: flags literal text in JSX (<p>Terug</p>) and translatable
// attributes, but not plain TS strings (API paths, keys, CSS values), which
// keeps the signal high. If a literal is genuinely not user-facing (units,
// emoji, brand names), add it to `words.exclude` — do NOT sprinkle
// eslint-disable comments unless the whole file is intentionally exempt.
import i18next from 'eslint-plugin-i18next'
import tseslint from 'typescript-eslint'

export default [
  {
    files: ['src/**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    ignores: [
      // The catalog itself and tests
      'src/i18n/**',
      'src/**/__tests__/**',
      'src/**/*.test.tsx',
      // Dutch-only by documented decision (calendar magazine redesign, see the
      // note at the top of src/i18n/translations.ts) — remove when translated:
      'src/components/calendar/**',

      // ── BASELINE (2026-07-13 language audit) ─────────────────────────────
      // Files below had hardcoded literals when this guard was introduced
      // (274 across 47 files). They are exempt so the guard could ship green;
      // NEW files are always enforced. When you touch one of these, translate
      // its strings and DELETE it from this list — the list must only shrink.
      // (AdminPage, the layout editor panels, and the debug overlays are
      // admin/dev-facing and may reasonably stay Dutch — decide per file.)
      'src/components/ErrorBoundary.tsx',
      'src/components/GardenBiodiversityCard.tsx',
      'src/components/IconPicker.tsx',
      'src/components/LeonAvatar.tsx',
      'src/components/PhaseCalendar.tsx',
      'src/components/PlantCareInfo.tsx',
      'src/components/add/EntryBanner.tsx',
      'src/components/discoveries/DiscoveriesSection.tsx',
      'src/components/discoveries/ExpeditionMap.tsx',
      'src/components/discoveries/ExpeditionMapGL.tsx',
      'src/components/editor/DimensionArrows.tsx',
      'src/components/editor/EditorCanvas.tsx',
      'src/components/editor/ObjectPropertiesPanel.tsx',
      'src/components/editor/WallElementPropertiesPanel.tsx',
      'src/components/editor/ZonePropertiesPanel.tsx',
      'src/components/game/GameLeaderboard.tsx',
      'src/components/map/CareNeedsList.tsx',
      'src/components/map/GlobalCareSheet.tsx',
      'src/components/map/MapView.tsx',
      'src/components/map/SelectionOverlay.tsx',
      'src/components/map/SunDebugOverlay.tsx',
      'src/components/map/WeatherPill.tsx',
      'src/components/plant/PhotoJournal.tsx',
      'src/components/settings/CompassBearingPicker.tsx',
      'src/components/sheets/MovePlantSheet.tsx',
      'src/components/sheets/PlantQuickSheet.tsx',
      'src/components/sheets/SpotInspectorSheet.tsx',
      'src/components/sun/DebugSvfOverlay.tsx',
      'src/components/sun/HeatmapLegend.tsx',
      'src/pages/AddPlant.tsx',
      'src/pages/AdminPage.tsx',
      'src/pages/EditPlant.tsx',
      'src/pages/GameHostPage.tsx',
      'src/pages/GameJoinPage.tsx',
      'src/pages/GamePlayerPage.tsx',
      'src/pages/LayoutEditorPage.tsx',
      // LoginPage is pre-auth (no account language exists yet) and renders in
      // English by design (Dutch is a Settings option) — permanent exemption.
      'src/pages/LoginPage.tsx',
      'src/pages/MapPage.tsx',
      'src/pages/MapSettingsPage.tsx',
      'src/pages/MapsListPage.tsx',
      'src/pages/PlantCareDetail.tsx',
      'src/pages/PlantDetail.tsx',
      'src/pages/ResetPasswordPage.tsx',
      'src/pages/Settings.tsx',
      'src/pages/calendar/CalendarAlmanac.tsx',
      'src/pages/calendar/CalendarGrid.tsx',
    ],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          markupOnly: true,
          'jsx-attributes': {
            include: ['alt', 'title', 'placeholder', 'aria-label', 'label'],
          },
          words: {
            // Not user-facing language: symbols, units, brand/product names.
            exclude: [
              '[0-9!-/:-@[-`{-~]+',
              '[A-Z_-]+',
              'Floreren',
              'floreren.app',
              'BioCLIP',
              'PlantNet',
              'Pl@ntNet',
              'm²',
              'cm',
              'mm',
              '°C',
              '%',
              '…',
              '⋯',
              '·',
              '—',
              '×',
              '▲',
              '▼',
            ],
          },
        },
      ],
    },
  },
]
