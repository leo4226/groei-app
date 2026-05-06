import type { ZoneStyleType } from '../types'

export const ZONE_NL: Record<ZoneStyleType, { naam: string; beschrijving: string }> = {
  deck:      { naam: 'Terras',   beschrijving: 'Vlonders, tegels of verharde buitenvloer' },
  soil:      { naam: 'Grond',    beschrijving: 'Tuinaarde voor planten en bloemen' },
  gravel:    { naam: 'Grind',    beschrijving: 'Grindpad of grindvlak' },
  lawn:      { naam: 'Gazon',    beschrijving: 'Gras of grasveld' },
  path:      { naam: 'Pad',      beschrijving: 'Looppad of bestrating' },
  water:     { naam: 'Water',    beschrijving: 'Vijver, fontein of waterpartij' },
  structure: { naam: 'Gebouw',   beschrijving: 'Schuur, berging, overkapping of buitenmuur' },
  room:      { naam: 'Kamer',    beschrijving: 'Kamer, hal of ruimte binnen het gebouw' },
  wall:      { naam: 'Muur',     beschrijving: 'Binnenmuur of scheidingswand' },
}

export const TOOLBAR_NL = {
  selecteren:    'Selecteren',
  tekenen:       'Tekenen',
  deurPlaatsen:  'Deur plaatsen',
  raamPlaatsen:  'Raam plaatsen',
  ongedaanMaken: 'Ongedaan maken',
  verwijderen:   'Verwijderen',
  voorbeeld:     'Voorbeeld',
  bewerken:      'Bewerken',
  svgExporteren: 'SVG exporteren',
  terug:         '← Terug',
} as const

export const OPSLAAN_NL = {
  opgeslagen:     'Opgeslagen',
  bezig:          'Opslaan...',
  nietOpgeslagen: 'Niet opgeslagen',
} as const

export const KAART_TYPE_NL = {
  tuin: '🌿 Tuin',
  huis: '🏠 Huis',
} as const

export const EIGENSCHAPPEN_NL = {
  zone:             'Zone',
  deur:             'Deur',
  raam:             'Raam',
  label:            'Label',
  lengte:           'Lengte (m)',
  breedte:          'Breedte (m)',
  hoogte:           'Hoogte (m)',
  breedteCm:        'Breedte (cm)',
  scharnier:        'Scharnier',
  links:            'Links',
  rechts:           'Rechts',
  naarBinnen:       'Naar binnen',
  naarBuiten:       'Naar buiten',
  openingsrichting: 'Openingsrichting',
  wanddikte:        'Wanddikte',
  buitenmuur:       'Buitenmuur',
  binnenmuur:       'Binnenmuur',
  hoekAfsnijding:   'Hoekafsnijding',
  hoek:             'Hoek',
  schaalKalibratie: 'Schaal kalibreren',
  schaalHint:       'Voer de werkelijke lengte van dit object in om de schaal in te stellen.',
  verwijderen:      'Verwijderen',
} as const

export const EDITOR_NL = {
  laden:             'Editor laden...',
  kaartNietGevonden: 'Kaart niet gevonden',
  legenda:           'Legenda',
} as const
