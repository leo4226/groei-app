# Floreren adaptation rules

Read this file before applying a Beautiful UI idea.

1. **Floreren decision:** Beautiful UI is reference material, not Floreren's design system. Start from the Floreren task, existing route, components, and styles.
2. **Floreren decision:** use `useT()` and the typed NL/EN catalog for every new visible string. Do not reproduce upstream wording or example data.
3. **Floreren decision:** preserve clear loading, empty, success, failure, disabled, and destructive states. Do not use colour or animation as the only signal.
4. **Floreren decision:** design for Floreren's mobile-first flows, then verify desktop. A desktop catalogue layout is not a mobile layout specification.
5. **Floreren decision:** use local semantic tokens and existing components before adding styles or dependencies. Do not add Beautiful UI custom tokens, global animation names, `glimm`, `liveline`, `iconoir-react`, or unresolved atoms only to imitate a reference.
6. **Floreren decision:** upstream code is not copied unless a future issue explicitly requests it and checks licence, notices, compatibility, accessibility, and dependencies.
7. **Inferred:** choose the narrowest useful pattern note through `active.yaml` and `catalogue.yaml`; unrelated notes add noise and can suggest features Floreren does not need.
8. **Observed upstream:** some snippets depend on custom Tailwind-like tokens, global variables, and animation names; compatibility is therefore not automatic.
9. **Not verified:** source snippets have not been integrated, audited, or tested in Floreren.
