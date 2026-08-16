# Task Rows

- **Stable ID:** `bui.task-rows`
- **Source:** [Beautiful UI — Task Rows](https://www.beautifului.dev/#task-rows)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** shows a compact list of live tasks with running, failed, and completed states.

## Anatomy and states

- **Observed upstream:** status icon or ordinal, task title, quantity/context, status badge, disclosure control, and optional child progress details.
- **Observed upstream:** rows can be collapsed or expanded; states distinguish work in progress and completion.
- **Inferred:** failure needs an explicit recovery or explanation path, not just a red treatment.

## Accessibility and motion

- **Observed upstream:** state appears in icon, label, and badge form.
- **Inferred:** preserve text equivalents, announce material status changes carefully, and avoid progress that relies on spinning alone.
- **Not verified:** whether all task states are keyboard reachable or announced.

## Possible Floreren use

- **Inferred:** batch operations such as multiple photo processing requests could need individual results when Floreren deliberately exposes them.

## Adaptation and cautions

- **Floreren decision:** prefer Floreren care terminology over generic “agent task” language.
- **Caution:** do not display artificial progress percentages when the underlying operation cannot measure them.
