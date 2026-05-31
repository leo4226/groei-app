# TODO — Floreren bugfixes & features

> Bewerkt via Oink/Leon. Data notities worden automatisch bijgewerkt.

## 🔴 Openstaand

-   [#14](https://github.com/leo4226/groei-app/issues/14) ⭐ **Identify → add plant crash** — `name` is `undefined` na 404 uit `commitIdentify`. Fix: fallback + optionele chaining in `AddPlant.tsx`
-   [#15](https://github.com/leo4226/groei-app/issues/15) ⭐⭐⭐ **📱 Editor modus kaart onbruikbaar op mobiel** — draait niet mee, resize knoppen te klein, zoom raar, vult niet volledig scherm
-   [#16](https://github.com/leo4226/groei-app/issues/16) ⭐⭐ **✨ Identify UX: nieuwe foto knop + PlantNet NL + camera zoom fix** — drie verbeteringen in identify flow
-   [#17](https://github.com/leo4226/groei-app/issues/17) ⭐ **🐛 BioCLIP hybrid-duplicaten (x in latin name)** — dedup nodig in `_bioclip_identify`

## ✅ Klaar (deze sessie)

-   [x] **Map + button touch fix** — `MapActionCluster.tsx`: added `type="button"`, `onPointerDown.stopPropagation()`, `touchAction: manipulation`
-   [x] **Identify → add plant crash** — `AddPlant.tsx`: veilige fallback voor `name`/`species` initializatie, optionele chaining in save handler
-   [x] **#16-3 📱 Camera zoom fix** — capture button nu `absolute` over video, blijft zichtbaar bij pinch-to-zoom
-   [x] **#17 🐛 BioCLIP hybrid-duplicaten** — latin name normalisatie: strip ` x ` / ` × ` voor dedup, houd hoogste confidence

## 📝 Notities

-   Nieuwe items: gewoon toevoegen met `- [ ]`
-   Afgerond: `[ ]` → `[x]`
-   Veeg voltooide items weg als de lijst te lang wordt
