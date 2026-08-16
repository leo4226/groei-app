# Sidebar Nav

- **Stable ID:** `bui.sidebar-nav`
- **Source:** [Beautiful UI — Sidebar Nav](https://www.beautifului.dev/#sidebar-nav)
- **Captured:** 2026-08-16

## Problem solved

- **Observed upstream:** groups workspace navigation, quick search, a prominent action, and object links in a narrow sidebar.

## Anatomy and states

- **Observed upstream:** workspace identity/switcher, quick-search control, primary action, labelled navigation groups, active item, icon/text rows, and count badge.
- **Observed upstream:** active navigation is visibly distinct; grouped sections organise destinations.
- **Inferred:** collapsed, mobile, and permission-limited states need intentional alternatives.

## Accessibility and motion

- **Observed upstream:** navigation items are labelled links or controls rather than icon-only marks.
- **Inferred:** keep the active destination programmatically clear and preserve a keyboard path to search and all destinations.
- **Not verified:** responsive collapse behaviour, focus order, and keyboard shortcut implementation.

## Possible Floreren use

- **Inferred:** its grouping and active-state hierarchy may inform desktop-only navigation refinements.

## Adaptation and cautions

- **Floreren decision:** do not replace Floreren’s mobile navigation or route structure from this reference. Use only a task-specific hierarchy lesson.
- **Caution:** workspace jargon and grouped object navigation may not fit a small household plant-care app.
