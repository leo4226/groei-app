# Tufte — The Visual Display of Quantitative Information — Samenvatting

> Gebaseerd op OCR van de volledige 2e editie (191 pagina's).
> Voor Floreren: principes om toe te passen op plantendata-visualisaties.

---

## HOOFDSTUK 1: Graphical Excellence

**Definitie:** Excellence in statistical graphics = complexe ideeën communiceren met helderheid, precisie en efficiëntie.

**6 Eisen voor goede graphics:**
1. **Show the data** — laat de data zien, niets anders
2. Denk aan de *substance*, niet aan methodologie, design of technologie
3. **Vermijd distortie** — vervorm niet wat de data zeggen
4. **Presenteer veel getallen in weinig ruimte**
5. **Maak grote datasets coherent**
6. **Moedig vergelijking aan** — het oog moet data kunnen vergelijken
7. **Onthul data op meerdere niveaus** — van breed overzicht tot fijne structuur
8. **Dien een helder doel** — beschrijving, exploratie, tabulatie of decoratie
9. **Sluit nauw aan** bij statistische en verbale beschrijvingen

**Cruciale quote:** "Graphical excellence is that which gives to the viewer the greatest number of ideas in the shortest time with the least ink in the smallest space."

**Multivariate karakter:** Graphical excellence is *bijna altijd multivariate*. En het vereist dat je de waarheid vertelt over de data.

**Anscombe's Quartet:** Vier datasets met exact dezelfde statistieken (gemiddelde, regressielijn, R²=.82) maar totaal verschillende grafische patronen. Bewijs dat *grafieken meer onthullen dan berekeningen*.

**Kerninzicht:** Graphics onthullen data. Ze kunnen preciezer en onthullender zijn dan conventionele statistische berekeningen.

---

## HOOFDSTUK 2: Graphical Integrity (Grafische Integriteit)

**Het probleem:** Veel graphics liegen. De eerste gedachte bij statistische grafieken is vaak "leugen".

**Lie Factor**
```
Lie Factor = size of effect shown in graphic / size of effect in data
```
- LF = 1.0 = correct
- LF > 1.05 of < 0.95 = substantiële distortie
- Voorbeeld: olieprijsgrafiek met LF = 14.8 (783% i.p.v. 53%)

**6 Principes voor Grafische Integriteit:**
1. **De representatie van getallen moet direct proportioneel zijn aan de numerieke grootte**
2. **Gebruik geen designvariatie als datavariatie** — "Show data variation, not design variation"
3. **Context is essentieel** — nooit data uit context citeren. "Compared to what?"
4. **Gebruik geen oppervlakte voor 1-dimensionale data** — "The representation of numbers should be directly proportional to the numerical quantities represented"
5. **Deflateer voor inflatie & bevolkingsgroei** bij tijdreeksen
6. **Grafieken moeten niet liegen door weglating** — data-thin designs zijn vaak misleidend

**Waarom graphics liegen:**
- Gebrek aan kwantitatieve vaardigheden bij ontwerpers
- De doctrine van "saaie data" (data is saai, dus versier het)
- Minachting voor intelligentie van de lezer ("If you have to explain it, don't use it")
- Politieke en commerciële belangen

**Visuele verwachtingen:**
- Elke schaal die regelmatig beweegt, moet consistent doorgaan tot het einde
- Onregelmatige schalen creëren pseudo-declines
- "Design variation corrupts" — het verwart de kijker

---

## HOOFDSTUK 3: Sources of Integrity and Sophistication

**3 Oorzaken van grafische middelmatigheid:**
1. Gebrek aan kwantitatieve vaardigheden bij illustratoren
2. Afkeer van kwantitatief bewijs
3. Minachting voor intelligentie van het publiek

**Consequenties:** Graphics die (1) liegen, (2) alleen simpele designs gebruiken, en (3) het echte nieuws in de data missen.

**Japanse uitzondering:** Japan scoort het hoogst in grafische verfijning, consistent met hun collectieve passie voor statistiek en grafieken vanaf jonge leeftijd (landelijke wedstrijden).

**De kloof tussen kunstenaars en statistici:**
- Kunstenaars: willen versieren, "humaniseren", "aankleden"
- Statistici: willen nauwkeurigheid
- Het gat wordt nooit overbrugd door middelmatigheid

---

## HOOFDSTUK 4: Data-Ink & Graphical Redesign

**Data-Ink Ratio:**
```
data-ink ratio = data-ink / total ink used in graphic
```

**Maximaliseer data-ink ratio, binnen redelijkheid:**
- Iedere inkt op een grafiek moet een reden hebben
- Die reden is bijna altijd: de inkt presenteert nieuwe informatie

**Principes:**
1. **Maximize the data-ink ratio, within reason**
2. **Erase non-data-ink, within reason**
3. **Erase redundant data-ink, within reason**

**Toepassingen:**
- **Box plot redesign** → quartile plot: minder lijnen, zelfde info (80 → 10 verticals)
- **Bar chart redesign:** frame weghalen, verticale as weghalen, ticks weghalen, white grid
- **Scatterplot redesign** → **range-frame:** alleen data tot de gemeten limieten, niet tot ronde getallen
- **Dot-dash-plot:** combineert marginale distributie met bivariate scatter in één design

**Range-frame:** Toont min/max van beide variabelen. Informeerder dan conventioneel frame. Kan ook kwartielen tonen (quartile plot).

---

## HOOFDSTUK 5: Chartjunk

**Definitie:** Interieurdecoratie van grafieken die geen nieuwe informatie toevoegt.

**3 Soorten Chartjunk:**
1. **Moiré vibraties** — optische trillingen door overmatige patronen (grids, cross-hatching). "Probably the most common form of graphical clutter."
2. **Grids** — donkere gridlijnen. "They carry no information, clutter up the graphic."
3. **Ducks** — graphics die zelf versiering worden (vernoemd naar duck-shaped architecture). Fake 3D, onnodige perspectief.

**Moiré oplossing:** Cross-hatching vervangen door grijstinten. Gebieden labelen met *woorden* in plaats van patronen.

**Grid oplossing:** Grijze grid i.p.v. zwart, of omgekeerde kant van ruitjespapier gebruiken. "If the paper is heavily gridded on both sides, throw it out."

**Duck symptomen:** Fake 3D, "We-Used-A-Computer-To-Build-A-Duck Syndrome". Versiering die de data overstemt.

**Conclusie:** "Graphics do not become attractive and interesting through the addition of ornament."

---

## HOOFDSTUK 6: Data Density

**Data Density:**
```
data density = number of entries in data matrix / area of data graphic
```

**Hoge datadichtheid is goed** — zolang de data interessant zijn. Gebruik graphics voor rijke, complexe data, niet voor simpele lineaire veranderingen (die kunnen in 1-2 getallen).

**Voorbeelden van hoge datadichtheid:**
- Kankermortaliteitskaart: 21.000 getallen op 1 pagina
- New York weather summary: 1.888 getallen
- Marey's treinschema: honderden aankomsten/vertrekken

**Grafische aritmetiek:** "Original design = erased part + good part" — een hulpmiddel om te denken over wat wel/n niet nodig is.

---

## HOOFDSTUK 7: Multifunctioning Graphical Elements

**Definitie:** Dezelfde inkt dient meerdere grafische doelen tegelijk.

**Voorbeelden van multifunctioning:**
- **Blot map:** 1 inktblot = locatie + vorm + dataniveau
- **Stem-and-leaf plot:** cijfers zijn zowel labels als data-meting
- **Ayres' divisiegrafiek:** 1 getal = maand + divisienaam + duur
- **Chernoff faces:** gezichtsuitdrukkingen = multivariate data-encoding
- **Data-based grids:** gridlijnen die ook data tonen
- **Data-based labels:** labels die de marginale distributie tonen

**3 Diepten van grafische weergave:**
1. Wat je van veraf ziet (overall structuur)
2. Wat je van dichtbij ziet (fijne details)
3. Wat je impliciet ziet (wat onder de grafiek ligt)

**Data-Based Grid:** Zeer zeldzaam maar krachtig — grid dat direct data rapporteert i.p.v. alleen coördinaten.

---

## HOOFDSTUK 8: Aesthetics and Technique

**Puzzles vs. Graphics:**
- Een grafiek moet **visueel** ervaren worden, niet **verbaal**
- "A sure sign of a puzzle is that the graphic must be interpreted through a verbal rather than a visual process"
- Voorbeeld: 16 kleuren op 3.056 counties = verbale decoder nodig ("now let's see, purple represents...")

**Kleur:**
- Het oog geeft geen natuurlijke ordening aan kleuren (behalve rood = hoog)
- Kleur leidt vaak tot grafische puzzels en "mentale frases"
- Gebruik kleur spaarzaam en alleen als het een natuurlijke hiërarchie heeft

**Hiërarchie in Graphics:**
Een goed design heeft meerdere *kijkdieptes*:
- Overall aggregate van een afstand
- Detail van dichtbij
- Wat impliciet achter de data zit

**Labeltechniek:**
- Labels moeten dicht bij de data-metingen staan
- Data-positioned numbers vervangen frame en ticks
- "Same ink should often serve more than one graphical purpose"

---

## Summary: De 10 Belangrijkste Tufte Principes

1. **Graphical Excellence** — complexe ideeën, helder, precies, efficiënt
2. **Show the Data** — geen afleiding, geen versiering, geen ruis
3. **Lie Factor = 1.0** — de visuele representatie moet exact kloppen met de cijfers
4. **Data-Ink Ratio** — maximaliseer de inkt die data toont; verwijder de rest
5. **Data Variation ≠ Design Variation** — verander nooit het design als er alleen data verandert
6. **Context** — altijd "compared to what?"
7. **Geen Chartjunk** — moiré, donkere grids, ducks, 3D-fakes
8. **High Data Density** — meer data per vierkante centimeter is beter (mits relevant)
9. **Multifunctioning Elements** — laat 1 inkt-element meerdere dingen doen
10. **Visueel, Niet Verbaal** — een grafiek moet uit zichzelf spreken

---

*"Graphics reveal data. Indeed graphics can be more precise and revealing than conventional statistical computations."*
— Edward Tufte
