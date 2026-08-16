# Insight Cards

- **Stable ID:** `bui.insight-cards`
- **Source:** [Beautiful UI — Insight Cards](https://www.beautifului.dev/#insight-cards)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** pairs a paged written insight with compact comparative metrics, a chart, and a follow-up action.

## Anatomy and states

- **Observed upstream:** insight count, previous/next controls, text finding, comparative values, chart panel, series markers, and follow-up prompt.
- **Observed upstream:** pagination switches between insight cards; chart series use semantic colours.
- **Inferred:** a data insight needs source/time range, loading, unavailable-data, and interpretation limits.

## Accessibility and motion

- **Observed upstream:** values are written in text next to the visual chart.
- **Inferred:** provide a text alternative for trends and do not communicate a positive/negative result by line colour alone.
- **Not verified:** chart keyboard navigation, data-table alternative, and exact chart update behaviour.

## Possible Floreren use

- **Inferred:** a future seasonal or biodiversity insight could combine a short conclusion with traceable measurements, if data quality supports it.

## Adaptation and cautions

- **Floreren decision:** do not show an insight without an explainable Floreren data basis and a readable non-chart summary. The observed snippet imports `liveline`; do not add it merely to imitate the visual.
- **Caution:** charts can imply certainty that care and weather data may not have.
