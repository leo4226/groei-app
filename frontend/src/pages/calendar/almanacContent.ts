export interface AlmanacRow { key: string; value: string; emphasis?: string }
export interface AlmanacEntry {
  eye: string
  title: string
  emphasis: string
  quote: string
  rows: AlmanacRow[]
}

export const ALMANAC_NL: AlmanacEntry[] = [
  { eye: 'Januari', title: 'Stille tijd', emphasis: 'rust',
    quote: 'Januari is de maand van plannen — bestel zaad, snoei wat slaapt, en geef de kamerplanten meer licht dan water.',
    rows: [
      { key: 'Daglengte', value: '8 u 30 min' },
      { key: 'Bodemtemp', value: '2 °C — wachten' },
    ]},
  { eye: 'Februari', title: 'Eerste tekenen', emphasis: 'ontwaken',
    quote: 'De grond is nog koud, maar krokus en sneeuwklokje wijzen de weg. Tijd om zaaiplannen te maken.',
    rows: [
      { key: 'Daglengte', value: '10 u 00 min' },
      { key: 'Bodemtemp', value: '3 °C' },
    ]},
  { eye: 'Maart', title: 'De start', emphasis: 'zaaien',
    quote: 'Maart laat zich zien — eerste zaadjes binnen, en buiten de eerste narcissen.',
    rows: [
      { key: 'Daglengte', value: '11 u 50 min' },
      { key: 'Bodemtemp', value: '6 °C' },
    ]},
  { eye: 'April', title: 'Voorjaar breekt door', emphasis: 'groei',
    quote: 'April doet wat hij wil — zon en regen wisselen elkaar af, en alles begint te lopen.',
    rows: [
      { key: 'Daglengte', value: '13 u 30 min' },
      { key: 'Bodemtemp', value: '9 °C' },
    ]},
  { eye: 'Mei in jouw tuin', title: 'Wat de maand brengt', emphasis: 'brengt',
    quote: 'Mei is de scharniermaand — na de IJsheiligen mag alles naar buiten, en de pioenroos staat klaar om met één warme dag tegelijk te ontluiken.',
    rows: [
      { key: 'IJsheiligen', value: '11 — 15 mei', emphasis: 'nu' },
      { key: 'Laatste vorst', value: 'verwacht 16 mei' },
      { key: 'Daglengte', value: '15 u 24 min' },
      { key: 'Bodemtemp', value: '12,1 °C · zaaien kan' },
    ]},
  { eye: 'Juni', title: 'Volle bloei', emphasis: 'overvloed',
    quote: 'Juni is licht en geur — rozen en pioen, eerste oogst van sla en aardbei.',
    rows: [
      { key: 'Daglengte', value: '16 u 40 min' },
      { key: 'Zomerzonnewende', value: '21 juni' },
    ]},
  { eye: 'Juli', title: 'Zomerhoogte', emphasis: 'water',
    quote: 'Juli vraagt water en oog voor schaduw. Wat nu gezaaid wordt komt in de herfst tot bloei.',
    rows: [
      { key: 'Daglengte', value: '16 u 20 min' },
      { key: 'Bodemtemp', value: '19 °C' },
    ]},
  { eye: 'Augustus', title: 'Late zomer', emphasis: 'oogst',
    quote: 'Augustus is oogst en delen. Tomaat, courgette, bonen — laat niet liggen.',
    rows: [
      { key: 'Daglengte', value: '14 u 40 min' },
      { key: 'Bodemtemp', value: '20 °C' },
    ]},
  { eye: 'September', title: 'Overgang', emphasis: 'zaaien',
    quote: 'September is herstart — winterhard zaaien, bollen poten, en de tuin opmaken voor wat komt.',
    rows: [
      { key: 'Daglengte', value: '12 u 40 min' },
      { key: 'Bodemtemp', value: '17 °C' },
    ]},
  { eye: 'Oktober', title: 'Goud en val', emphasis: 'opruimen',
    quote: 'Oktober kleurt en valt. Plant nu wat in het voorjaar moet bloeien.',
    rows: [
      { key: 'Daglengte', value: '10 u 50 min' },
      { key: 'Bodemtemp', value: '12 °C' },
    ]},
  { eye: 'November', title: 'Tot rust', emphasis: 'sluit',
    quote: 'November dekt af. Mulch, snoei, en geef de bodem rust.',
    rows: [
      { key: 'Daglengte', value: '9 u 00 min' },
      { key: 'Bodemtemp', value: '6 °C' },
    ]},
  { eye: 'December', title: 'Lege bladzijden', emphasis: 'plannen',
    quote: 'December is leeg en helder — een goed moment om volgend jaar te tekenen.',
    rows: [
      { key: 'Daglengte', value: '7 u 50 min' },
      { key: 'Wintersolstice', value: '21 december' },
    ]},
]

export const ALMANAC_EN: AlmanacEntry[] = [
  { eye: 'January', title: 'Quiet time', emphasis: 'rest',
    quote: 'January is for planning — order seeds, prune what sleeps, and give houseplants more light than water.',
    rows: [
      { key: 'Day length', value: '8 h 30 min' },
      { key: 'Soil temp', value: '2 °C — wait' },
    ]},
  { eye: 'February', title: 'First signs', emphasis: 'awakening',
    quote: 'The ground is still cold, but crocus and snowdrop show the way. Time to plan your sowing.',
    rows: [
      { key: 'Day length', value: '10 h 00 min' },
      { key: 'Soil temp', value: '3 °C' },
    ]},
  { eye: 'March', title: 'The start', emphasis: 'sowing',
    quote: 'March shows itself — first seeds indoors, and the first daffodils outside.',
    rows: [
      { key: 'Day length', value: '11 h 50 min' },
      { key: 'Soil temp', value: '6 °C' },
    ]},
  { eye: 'April', title: 'Spring breaks through', emphasis: 'growth',
    quote: 'April does what it wants — sun and rain take turns, and everything starts to run.',
    rows: [
      { key: 'Day length', value: '13 h 30 min' },
      { key: 'Soil temp', value: '9 °C' },
    ]},
  { eye: 'May in your garden', title: 'What the month brings', emphasis: 'brings',
    quote: 'May is the hinge month — after the Ice Saints everything can go outside, and the peony stands ready to unfurl on a single warm day.',
    rows: [
      { key: 'Ice Saints', value: '11 — 15 May', emphasis: 'now' },
      { key: 'Last frost', value: 'expected 16 May' },
      { key: 'Day length', value: '15 h 24 min' },
      { key: 'Soil temp', value: '12.1 °C · sow now' },
    ]},
  { eye: 'June', title: 'Full bloom', emphasis: 'abundance',
    quote: 'June is light and scent — roses and peonies, first harvest of lettuce and strawberry.',
    rows: [
      { key: 'Day length', value: '16 h 40 min' },
      { key: 'Summer solstice', value: '21 June' },
    ]},
  { eye: 'July', title: 'Midsummer', emphasis: 'water',
    quote: 'July asks for water and an eye for shade. What you sow now will bloom in autumn.',
    rows: [
      { key: 'Day length', value: '16 h 20 min' },
      { key: 'Soil temp', value: '19 °C' },
    ]},
  { eye: 'August', title: 'Late summer', emphasis: 'harvest',
    quote: 'August is harvest and sharing. Tomatoes, courgettes, beans — don\'t leave them hanging.',
    rows: [
      { key: 'Day length', value: '14 h 40 min' },
      { key: 'Soil temp', value: '20 °C' },
    ]},
  { eye: 'September', title: 'Transition', emphasis: 'sowing',
    quote: 'September is a restart — sow winter-hardy crops, plant bulbs, and dress the garden for what\'s to come.',
    rows: [
      { key: 'Day length', value: '12 h 40 min' },
      { key: 'Soil temp', value: '17 °C' },
    ]},
  { eye: 'October', title: 'Gold and fall', emphasis: 'clearing',
    quote: 'October colours and falls. Plant now what should bloom in spring.',
    rows: [
      { key: 'Day length', value: '10 h 50 min' },
      { key: 'Soil temp', value: '12 °C' },
    ]},
  { eye: 'November', title: 'To rest', emphasis: 'close',
    quote: 'November covers up. Mulch, prune, and give the soil rest.',
    rows: [
      { key: 'Day length', value: '9 h 00 min' },
      { key: 'Soil temp', value: '6 °C' },
    ]},
  { eye: 'December', title: 'Blank pages', emphasis: 'planning',
    quote: 'December is empty and clear — a good moment to sketch next year.',
    rows: [
      { key: 'Day length', value: '7 h 50 min' },
      { key: 'Winter solstice', value: '21 December' },
    ]},
]
