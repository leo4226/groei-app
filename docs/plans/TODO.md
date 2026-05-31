# TODO — Floreren bugfixes & features

> Bewerkt via Oink/Leon. Data notities worden automatisch bijgewerkt.

## 🔴 Openstaand

-   [#14](https://github.com/leo4226/groei-app/issues/14) ⭐ **Identify → add plant crash** — ✅ **Closed**, deployed in `2c3fbe2`
-   [#15](https://github.com/leo4226/groei-app/issues/15) ⭐⭐⭐ **Editor map mobiel** — nog geen plan
-   [#16](https://github.com/leo4226/groei-app/issues/16) ⭐⭐ **Identify UX** — part 3 (zoom) ✅ klaar, part 1 (nieuwe foto knop bij PlantNet ook) & part 2 (NL taal) nog open
-   [#17](https://github.com/leo4226/groei-app/issues/17) ⭐ **BioCLIP hybrid-duplicaten** — ✅ **Closed**, deployed in `2c3fbe2`

## ✅ Klaar (deze sessie)

-   [x] **Map + button touch fix** — `MapActionCluster.tsx`: added `type="button"`, `onPointerDown.stopPropagation()`, `touchAction: manipulation`
-   [x] **Identify → add plant crash** — `AddPlant.tsx`: veilige fallback voor `name`/`species` initializatie, optionele chaining in save handler
-   [x] **#16-3 📱 Camera zoom fix** — capture button nu `absolute` over video, blijft zichtbaar bij pinch-to-zoom
-   [x] **#17 🐛 BioCLIP hybrid-duplicaten** — latin name normalisatie: strip ` x ` / ` × ` voor dedup, houd hoogste confidence

## 📝 Notities

-   Nieuwe items: gewoon toevoegen met `- [ ]`
-   Afgerond: `[ ]` → `[x]`
-   Veeg voltooide items weg als de lijst te lang wordt
