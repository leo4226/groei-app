# Tufte voor Floreren — Toepassing op Plantendata

Hoe we Tufte's principes toepassen op de Floreren planten-database en -visualisaties.

---

## 1. Anscombe's Quartet → Species Data Quality

Tufte's punt: **statistieken zijn geen vervanging voor visualisatie**. Voor Floreren:
- Twee soorten met dezelfde "hardiness zone" kunnen compleet ander gedrag vertonen
- Een soort met 6.000+ entries kan statistisch normaal lijken maar rare uitschieters hebben
- **Plant cards moeten data tonen, niet alleen samenvattingen**

## 2. Lie Factor = 0 → Geen Overdrijving

- Als een plant "medium water" nodig heeft, gebruik dan geen grafiek die op "veel" lijkt
- Groottes van icoontjes moeten exact kloppen met de schaal
- **Geen 3D-effecten op plantkaarten** — "phony statistical studies"

## 3. Data-Ink Ratio → Minimale Plantenkaarten

- Kleur alleen gebruiken om *data* aan te geven, niet voor decoratie
- Elk element op een plant card moet een datadoel dienen
- **Voorbeeld:** in plaats van een badge "zon: volle zon" → een kleine zon-icoon met helderheid die de intensiteit toont

## 4. Show Data Variation, Not Design Variation

- Als een gebruiker door soorten scrollt, mag alleen de *data* veranderen, niet de layout
- **Uniforme kaarten** — consistent grid, alleen de inhoud varieert
- Voorkom dat designverschillen ten onrechte als dataverschillen worden geïnterpreteerd

## 5. Context = "Compared to What?"

- Toon een plant niet in isolatie — geef context:
  - "deze plant is droogtetoleranter dan 80% van de kamerplanten"
  - "gemiddelde waterbehoefte vergeleken met andere vetplanten"
  - **Relatieve schalen** beter dan absolute

## 6. Geen Chartjunk

| Vermijden | Gebruiken |
|-----------|-----------|
| Moiré/hashing in water-/zonindicatoren | Effen grijstinten of simpele kleuren |
| Dikke randjes, schaduwen, 3D | Platte, minimalistische kaarten |
| Dubbele informatie (zon-icon + label "zon") | 1 element = 1 functie |
| Decoratieve patronen | Data als decoratie |

## 7. Hoge Data Density

Plant cards moeten *veel* informatie tonen in *weinig* ruimte:
- Niet alleen "volle zon" — ook de intensiteit en duur
- Niet alleen "matig water" — ook frequentie en seizoensvariatie
- **Zon/water badges die ook feetback geven op schaal**

## 8. Multifunctioning Elements

Ideeën voor Floreren:
- **Zon-schaal:** laat de kleurintensiteit ook de duur van zonlicht aangeven
- **Water-meter:** hoogte van het balkje = frequentie, dikte = hoeveelheid
- **Temperatuurbereik:** een lijn die ook aangeeft of de plant winterhard is (lijn kleurt anders onder 0°C)

## 9. Visueel, Niet Verbaal

- Een gebruiker moet in 1-2 seconden de belangrijkste eigenschappen zien
- Geen puzzels die een "handleiding" nodig hebben
- **Icoon moet intuïtief zijn** — geen legenda nodig

## 10. Dieptes van Informatie

Tufte's 3 kijkniveaus:
1. **Van veraf** — "is dit een vetplant of een tropische?" (overall shape, kleur)
2. **Van dichtbij** — "hoeveel water, welke zon, welke temperatuur?" (badges, schalen)
3. **Impliciet** — "wat zegt dit over de verzorging?" (patroonherkenning over meerdere planten)

---

## Concrete Checklist voor Plant Cards

- [ ] Lie Factor ≈ 1.0? (geen overdreven visuele schalen)
- [ ] Data-Ink Ratio > 80%? (geen decoratieve elementen)
- [ ] Consistent design bij verschillende soorten?
- [ ] Visueel leesbaar zonder legenda/woorden?
- [ ] Multifunctionerende elementen waar mogelijk?
- [ ] Drie informatieniveaus beschikbaar?
- [ ] Context/vergelijking aanwezig?
- [ ] Geen chartjunk (moiré, 3D, overbodige rasters)?
