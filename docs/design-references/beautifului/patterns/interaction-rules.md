# Interaction rules observed across the catalogue

## State communication

- **Observed upstream:** components communicate loading, running, completed, failed, approval, confidence, selection, and proposed-change states close to the affected content.
- **Observed upstream:** expandable traces, chips, tabs, filters, pagination, and compact action areas keep secondary detail available without always showing it.
- **Inferred:** state labels and progress context can reduce ambiguity more safely than motion or colour alone.

## Floreren use rules

- **Floreren decision:** use a reference pattern only when it serves a real Floreren task. Do not add agent-like traces, confidence, or approval surfaces as decoration.
- **Floreren decision:** actions that write, delete, archive, or change care data need a clear result and an appropriate confirmation path. This library does not replace existing Floreren safeguards.
- **Floreren decision:** keep mobile touch targets, screen-reader names, keyboard operation, and i18n content in the local implementation plan.

## Unknowns

- **Not verified:** the upstream keyboard order, focus management, screen-reader wording, error recovery, and persistence behaviour were not fully tested.
