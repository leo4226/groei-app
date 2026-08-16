# Approval Card

- **Stable ID:** `bui.approval-card`
- **Source:** [Beautiful UI — Approval Card](https://www.beautifului.dev/#approval-card)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** asks a bounded human-in-the-loop question before an action, with preset and custom answers.

## Anatomy and states

- **Observed upstream:** question heading, dismiss control, choice list, custom text field, step indicators, and previous/next controls.
- **Observed upstream:** choices and pagination move the user through a multi-question decision.
- **Inferred:** selecting a choice must visibly confirm the selected value before a consequential next step.

## Accessibility and motion

- **Observed upstream:** options and navigation are exposed as controls.
- **Inferred:** use one labelled choice group, preserve keyboard selection, and give the custom field a clear relationship to the question.
- **Not verified:** focus restoration on dismiss, validation of custom answers, and mobile layout.

## Possible Floreren use

- **Inferred:** a future Stekkie write proposal could use a short, explicit confirmation choice before it changes care data.

## Adaptation and cautions

- **Floreren decision:** confirmation must describe the Floreren change in plain language and retain a cancel path. Do not infer consent from a default option.
- **Caution:** do not turn routine, reversible navigation into a multi-step approval flow.
