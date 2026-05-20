# Weer: Historisch → Forecast migratie

## Doel

Vervang historische weerdata in de backend door forecastdata zodat vorst/hitte-waarschuwingen toekomstgericht zijn ("Vorst vannacht" i.p.v. "Vorst — min -2°C").

## Huidige situatie

| Component | Nu | Moet |
|---|---|---|
| `OPEN_METEO_TEMP_URL` | `past_days=7&forecast_days=0` | `past_days=1&forecast_days=7` |
| `OPEN_METEO_URL` (regen) | `past_days=14&forecast_days=0` | `past_days=7&forecast_days=7` |
| `_weather_warnings_for_plant()` | week_min/max over alle dagen, statische messages | Vindt *dichtsbijzijnde* dag met extreme temp, messages met timing |
| Frontend `useWeather` | ✅ al `forecast_days: 7` | Geen wijziging |
| Frontend `WeatherCard` | ✅ al 7-daagse forecast | Geen wijziging |
| Frontend `DashboardHeader` | Toont actuele temp + zon op/kort | Optioneel: "deze week 8-16°C" toevoegen |

## Stappen

### Stap A — Open-Meteo URLs aanpassen

**Bestand:** `backend/routers/plant_care.py`

1. `OPEN_METEO_TEMP_URL`: `past_days=1&forecast_days=7` (gisteren voor context, komende 7 dagen)
2. `OPEN_METEO_URL`: `past_days=7&forecast_days=7` (7d historisch + 7d forecast voor watering)
3. `_get_rain_data()` update `total_7day_mm` en `total_14day_mm` logica — werkt nog steeds want het pakt de laatste N dagen uit de array

### Stap B — `_weather_warnings_for_plant()` forecast-aware maken

**Bestand:** `backend/services/warnings.py`

1. `today: date` toevoegen als parameter
2. Na `week_min / week_max` bepalen: zoek de *dichtsbijzijnde* dag in de `days` array die voldoet aan de drempel
3. Als alle extreme dagen in het verleden liggen: skip de waarschuwing (tenzij vandaag ook extreem)
4. Messages met timing:
   - Vandaag: "Vorst vannacht — min -2°C" / "Hitte vandaag — max 35°C"
   - Morgen: "Morgen vorst — min -2°C" / "Morgen hitte — max 35°C"
   - Over 2+ dagen: "Over X dagen vorst — min -2°C" / "Over X dagen hitte — max 35°C"
5. Werk de aanroep in `compute_plant_warnings()` bij om `today` door te geven

### Stap C — Backend testen

1. Start uvicorn, fetch `/warnings/summary` endpoint
2. Controleer dat berichten zeggen "verwacht" / "vannacht" / "over X dagen" in plaats van alleen "— min X°C"
3. Controleer dat `_get_temp_data()` nu `forecast_days=7` data teruggeeft (niet leeg)

### Stap D — Frontend header verrijken (optioneel)

**Bestand:** `frontend/src/pages/Dashboard.tsx`

1. In `DashboardHeader`, de almanac grid uitbreiden: "Deze week 12–18°C ☁️" o.i.d. uit `weather.forecast`
2. Of: in de `WeatherCard` een samenvattingsregel bovenaan: "Deze week: 8–16°C, regen dinsdag"

### Stap E — Bouw + typecheck

1. `npx tsc --noEmit` in frontend
2. `npx vite build` in frontend

## Bestanden die wijzigen

- `backend/routers/plant_care.py` — 2 URL's, ~5 regels
- `backend/services/warnings.py` — `_weather_warnings_for_plant()` rewrite (~30 regels)
- `frontend/src/pages/Dashboard.tsx` — optionele header verrijking

## Risico's

- Open-Meteo forecast wordt `null` voor dagen ver in de toekomst (bv. dag 6-7). De `round(mn or 0.0)` in `_get_temp_data()` vangt dit al af.
- Cache (`_temp_cache`, `_rain_cache`) werkt nog steeds: 1-uur TTL is prima voor forecast (verandert niet snel).
- Als forecast wegvalt (API down), valt `_get_temp_data()` terug op `_TEMP_FALLBACK` — warnings worden dan niet gegenereerd, veilig.
