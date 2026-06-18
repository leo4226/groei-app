# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Difficulty labels

Independent of the triage role, every issue is ranked by rough effort to fix. This
mirrors the ⭐ convention in `docs/plans/TODO.md`.

| Label                | Stars | Meaning                                   |
| -------------------- | ----- | ----------------------------------------- |
| `difficulty: easy`   | ⭐     | Quick, low-risk fix                       |
| `difficulty: medium` | ⭐⭐    | Moderate effort                           |
| `difficulty: hard`   | ⭐⭐⭐   | Substantial or tricky / unknown territory |

Apply one during triage. The **🐛 Bug report** form
(`.github/ISSUE_TEMPLATE/bug_report.yml`) lets the reporter add a guess in the body;
confirm it with the real label when the issue is triaged.

## `in-progress` — soft lock (parallel agents)

Several agents run at once, so `in-progress` is a **soft lock, not a triage state**. An
agent adds it the moment it starts an issue (§7) and removes it if it abandons the work.
**Only pick issues that are `ready-for-agent` and NOT `in-progress`.** See
`how-we-work.md` §3 and §7.

## Routing — who works which role

When the `triage` skill accepts an issue (and clears `needs-triage`), it must set a
`difficulty: …` label **and** route to one of:

- `ready-for-agent` → **DeepSeek / executor agents** — clear, fully specified, AFK-ready.
- `ready-for-human` → **Claude or Leon** — needs a plan, judgment, or has no obvious solution.

See `triage-cheatsheet.md` for the step-by-step.
