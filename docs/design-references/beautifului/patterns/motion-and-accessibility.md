# Motion and accessibility

## Observed motion

- **Observed upstream:** the catalogue presents shimmer, fade, fade-up, pop-in, spin, and streamed-content motion.
- **Observed upstream:** it presents a global reduced-motion behaviour.
- **Inferred:** motion mainly communicates waiting, arrival, and progress; a static state label remains necessary when motion is reduced or missed.

## Floreren adaptation

- **Floreren decision:** motion must be optional enhancement. A Floreren implementation must remain understandable with `prefers-reduced-motion` active and must not make completion, failure, or important information visible only through animation.
- **Floreren decision:** use the least motion that explains a real state change. Avoid indefinite decorative motion in care and map flows.
- **Floreren decision:** test focus, timing, contrast, and touch interaction locally; do not assume them from this reference.

## Not verified

- **Not verified:** exact animation durations, easing, interruption handling, live-region announcements, and all reduced-motion substitutions in the upstream implementation.
