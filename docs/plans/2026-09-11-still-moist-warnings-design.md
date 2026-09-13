# Warnings that can say "nog nat genoeg"

## The problem

The watering warning fires on the calendar alone. It does not ask whether the
plant is still wet, so it fires after a week of rain, and it fires the evening
you watered. Leon's framing is the important part:

> Een waarschuwing die je wegklikt omdat hij niet klopt, leert je alle
> waarschuwingen weg te klikken.

The cost is not the one wrong line. It is that dismissing warnings becomes a
habit, and the habit carries over to the frost warning that was right.

## The open question, answered

> Waar komt het vochtsignaal vandaan — laatst-gegoten-datum + soort/pot/seizoen,
> of een echte meting?

Both, and neither needs new hardware. Everything required was already in the
codebase and simply never pointed at this question:

| Signal | Where it already comes from |
|---|---|
| Last watered | `care_schedules.last_done` — the plant's own care log, not the garden-wide date |
| Rainfall, per day | Open-Meteo `precipitation_sum`, seven past days |
| Evaporation, per day | Open-Meteo `et0_fao_evapotranspiration` |
| Dry air | `relative_humidity_2m_max` |
| **Measured topsoil moisture** | `soil_moisture_0_to_7cm_mean` — a real reading, for open ground |
| Pot vs ground | `plants.container_id` / `ground_zone_id` |
| Mulch, shade | `plants.mulch`, `plants.measured_sun_hours` |

`services/weather_forecast.py` has been fetching all of these since the water
pressure work. So the answer is: a water-balance estimate from the watering date
plus measured weather, with one genuinely measured branch for in-ground plants.
A pot sensor would improve the indoor case, and nothing else.

## What was built

`assess_moisture()` in `services/water_pressure.py`. A bounded reservoir:
watering fills it, rain tops it up at the environment's capture rate, each day's
evapotranspiration and heat draw it down, and it can neither overflow nor go
below empty. Days are walked in the order they happened, because rain-then-heat
and heat-then-rain leave very different soil and a window average cannot tell
them apart.

The threshold is stated in days, not as a share of capacity: a due watering
waits only while the root zone still holds **at least one more day** of drying
at this week's rate. That is the actual question being asked, and it stays right
whether the pot is small or the week is cold.

When the verdict is `moist`, `compute_plant_warnings` replaces the water
schedule warning with an `info`-severity one carrying `code:
"water_still_moist"` — "Nog niet gieten — grond is nog vochtig", with the
reading that justifies it. Inverted rather than hidden: a plant that silently
drops off the list looks like a bug, and the same line turns back into "water
it" the day the soil dries, which is what makes it worth reading.

## What it is deliberately not allowed to do

- **Not indoors.** A pot next to a radiator dries on its own schedule. Reading
  it off the outdoor forecast would suppress every indoor reminder from November
  to March — a wrong warning replaced by a wrong silence. Indoor returns
  `unknown`, and nothing is suppressed.
- **Not on stale data.** The readings must reach today, or the verdict is
  `unknown`. Last week's rain is not a claim about this morning's soil.
- **Never on no evidence.** The verdict is three-valued. `unknown` behaves like
  `drying`, never like `moist`.
- **It does not move the deadline.** Read-side only. `care_summary` still says
  the plant is overdue, and no schedule row is rewritten, so one wet week cannot
  quietly push a plant a week out. *(Superseded two days later — see "Rain
  credits the schedule" below, which moves the deadline on purpose and explains
  why suppression alone was not enough.)*
- **It never outranks a real warning.** `("weather_event", "info")` is the
  lowest priority bucket there is.

## Rain credits the schedule (2026-09-13)

Suppression alone left two answers on screen: a calm line saying the soil is
wet, next to a counter climbing past "14 dagen te laat". Both true, together
nonsense — and every surface had to learn the suppression separately. The plant
page did. The map badge did not, and kept drawing a watering droplet under a
line that said not to water.

So `services/rain_credit.py` moves the deadline instead. When the root zone
still holds water, `next_due` goes forward by the days the model says are left.
Nothing downstream needs to know: badge, push, dashboard and digest all read
`next_due` and all go quiet at once, because the plant is not due.

Its limits are the interesting part:

- **Never writes `care_log`, never touches `last_done`.** Those record what a
  person did. A log saying Leon watered on a day he did not is worse than any
  reminder it saves him.
- **Capped at one interval from today**, so a wet fortnight cannot turn a 5-day
  blueberry into a monthly one.
- **Only credits a deadline that has already arrived.** A forecast does not get
  to reschedule a plant that was not asking for anything.
- **Clears `notified_for_due`.** That column records the deadline a push went
  out for; left stale, the reminder for the new date is swallowed as a duplicate.
- **Indoor and ephemeral schedules are untouched.**

The still-moist line survives as the explanation. `compute_plant_warnings`
recognises a credited schedule by derivation — its own rhythm (`last_done` plus
`interval_days`) says it was due by now, but `next_due` sits in the future — so
no column and no migration. A plant that was overdue yesterday and silent today
would otherwise look like something got missed.

## Surfaces

Wired through `compute_plant_warnings`, so the plant page, the dashboard
summary, the legacy alert endpoints and the map's warning fields all agree. The
canvas badge skips `info` warnings, since a badge is drawn from `care_type`
alone and an advisory would otherwise render the same icon as an alarm. The
map's coloured halo still comes from the older `care_status`/`alerts` pipeline,
which is schedule-only and unchanged here.

## Still open

- A moisture check the user resolves as "still moist" does not feed back into
  the estimate. Their finger in the soil is better evidence than the model.
- Indoors remains schedule-only. The honest fixes are a real sensor, or letting
  a "still moist" answer push the next due date out.
- The container capture rate assumes a pot stands in the rain. A pot under an
  overhang is modelled as wetter than it is; no data today says which is which.
