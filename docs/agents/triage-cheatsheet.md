# Triage Cheat-Sheet

Triage = turning a **raw report** into **ready-to-work** (or rejecting it). Done by
Leon (or Claude) at a real machine — not on the phone. Labels are defined in
`triage-labels.md`; the full workflow is in `how-we-work.md`.

## The 4 steps

1. **Read** the new issue (arrives as `needs-triage`).
2. **Clear enough to act on?**
   - No → label `needs-info`, comment your question. *(blocked until Leon answers)*
3. **Worth doing?**
   - No → label `wontfix`, close.
4. **Yes → do both:**
   - **Set difficulty:** `difficulty: easy | medium | hard`.
   - **Route it** (then remove `needs-triage`):
     - clear & contained fix → **`ready-for-agent`** (a DeepSeek/executor agent does it)
     - needs a plan / judgment / no obvious solution → **`ready-for-human`** (Claude or Leon)

That's it: **read → clarify-or-reject → set difficulty + route.**

## Decision table

| The issue is… | Label it | Who works it |
|---|---|---|
| missing info | `needs-info` | nobody (blocked) |
| not worth doing | `wontfix` + close | nobody |
| clear, contained, obvious fix | `difficulty: …` + `ready-for-agent` | DeepSeek/executor |
| fuzzy goal, needs a plan or hard judgment | `difficulty: …` + `ready-for-human` | Claude / Leon |

## Commands

```bash
# review the inbox
gh issue list --label "needs-triage" --state open
gh issue view <n> --comments

# ask for more info
gh issue edit <n> --add-label "needs-info"
gh issue comment <n> --body "Which garden + zoom level does this happen at?"

# reject
gh issue close <n> --comment "Out of scope for now." # (add wontfix if you want it kept visible)
gh issue edit <n> --add-label "wontfix"

# accept → set difficulty + route, and clear needs-triage
gh issue edit <n> --add-label "difficulty: medium,ready-for-agent" --remove-label "needs-triage"
#   ...or route to Claude/Leon:
gh issue edit <n> --add-label "difficulty: hard,ready-for-human"   --remove-label "needs-triage"
```

## Example — bug spotted in the map view

1. **Phone:** GitHub app → New issue → 🐛 Bug report → *"Map view: south-facing cells
   show as shaded"* → submit. Auto-labeled `bug` + `needs-triage`.
2. **Triage (desk):** reproducible & clear → `gh issue edit <n> --add-label
   "difficulty: medium,ready-for-agent" --remove-label "needs-triage"`.
3. **Execute:** a DeepSeek agent finds it via `gh issue list --label ready-for-agent`,
   works it in its own worktree, opens a PR with `Closes #<n>`.
4. **Merge:** Leon reviews the diff, merges → issue closes → deploy.
