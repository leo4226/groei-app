# Testing audit — is the suite too big?

_2026-08-21. Triggered by "Backend 1353 tests pass — don't we have too many?"_

## Verdict

**No, and the premise is worth correcting: test count is not the problem.**
The suite is fast, honest, and incident-driven. But there **is** a real
structural problem underneath the question — the suite can only ever grow —
and there are four concrete pockets of waste worth fixing.

The measurements below were taken on this branch, not estimated.

---

## 1. The data

| | Backend | Frontend | Total |
|---|---|---|---|
| Tests | 1416 (+4 skipped) | 800 | **2216** |
| Test files | 168 | 142 | 310 |
| Source files | 114 | 316 | 430 |
| Wall-clock runtime | **34s** | **37s** | **~71s** |

Backend test LOC (30,932) vs backend source LOC (35,333) — a 0.88:1 ratio,
which is unremarkable for a codebase carrying auth, billing-shaped
household roles, and an ML identify pipeline.

**The whole suite runs in about a minute.** Whatever "too many tests" costs
us, it is not developer time waiting for a run, and it is not CI minutes.
That reframes the question: the cost of this suite is *maintenance surface*,
not speed.

## 2. Growth pattern — the user's instinct was right

Test files present at the end of each month, and the add/delete flow:

| Month | Source files | Test files | Added | Deleted |
|---|---|---|---|---|
| 2026-05 | 56 | 17 | 32 | 13 |
| 2026-06 | 79 | 55 | 43 | **0** |
| 2026-07 | 102 | 123 | 65 | **0** |
| 2026-08 | 114 | 168 | 41 | **0** |

**Since 1 June: 149 test files added, 0 removed.** Source files roughly
doubled; test files grew 10×. Test files now outnumber source files 1.5:1.

This is not agents being undisciplined. It is exactly what the system is
built to produce — see §4.

## 3. What is actually healthy (and should not be "cleaned up")

Before the criticisms, the parts that a naive cull would damage:

- **Tests assert behaviour, not mocks.** Across 168 backend test files there
  are **4** total occurrences of `assert_called` / `call_count` /
  `assert_awaited`. Almost nothing in this suite is a test of its own test
  double. That is rare and worth protecting.
- **One skip in the entire backend suite** (`test_db_adapter.py`, which skips
  cleanly when no Postgres is reachable). No accumulated `xfail` rot.
- **Tests are incident-driven and say so.** A sample of files that *look*
  like meta-test bloat by their names turned out to each guard a specific
  production failure, documented in the docstring:
  - `test_docker_context.py` — a `.dockerignore` anchoring bug that shipped
    1.5 GB to the remote builder.
  - `test_weather_test_isolation.py` — suite results depending on the live
    Amsterdam forecast.
  - `test_bug_detector.py`, `test_llm_config.py` — config/parsing regressions.
- **CI jobs are each justified by a named incident** in `ci.yml`'s comments
  (the `layout` job, the vitest job, the `migrations` job). This is a suite
  that grew from pain, not from ceremony.

Any pruning must not touch this class. The waste is elsewhere and it is
specific.

## 4. The real problem: the guard is a ratchet with no release

`pr-review.yml`'s `test-guard` **blocks any PR whose diff deletes a test or
adds a skip marker.** The only escape is the `tests-intentionally-removed`
label, which — correctly — an agent may not apply to its own PR.

The guard is right to exist. Its stated purpose is to stop a cheap model
from deleting a failing test instead of fixing it, and that is a real
failure mode.

But it is a one-way ratchet:

- Adding a test: free, encouraged, and the `tdd` skill mapped in §4 of
  `how-we-work.md` makes it the default for every issue.
- Removing a test: needs Leon, on a PR, in the moment — which never
  happens, because no issue is ever *about* deleting tests.

Result: 149 added, 0 removed. **The absence of pruning is a property of the
machine, not a lapse in discipline.** Loosening the guard is the wrong fix;
it would restore exactly the failure mode it was built to prevent. The fix
is to give the ratchet a deliberate release — see §6.

## 5. Four concrete pockets of waste

### 5a. Per-issue test files that duplicate each other — the viewer authz family

Four files, 1469 LOC, one per issue:

| File | Issue |
|---|---|
| `test_viewer_core_write_authorization.py` | #921 |
| `test_viewer_map_reference_write_authorization.py` | #922 |
| `test_viewer_household_account_planning_write_authorization.py` | #923 |
| `test_viewer_route_inventory.py` | #924 |

Each file opens with its own *"the write inventory is complete"* meta-test
asserting over its own hardcoded subset of routes. The newest one (#924)
asserts:

```python
assert set(policy_keys) == set(mounted_routes)
```

— i.e. **every mounted write route in the whole app** has exactly one policy
entry, with the correct dependency, across a richer category model
(editor / owner / admin / public / guest) than the three earlier files use.

The #924 inventory is a **strict superset** of the three earlier partial
inventories. Those three meta-tests are provably subsumed and can go.

**That is the whole of the redundancy — the scope here is three meta-tests,
not three files.** An earlier draft of this audit also called
`test_viewer_read_routes_remain_available` "verbatim-triplicated" because the
function name is identical in three files. It was wrong: the bodies are
disjoint and cover different route groups —

| File | Routes it reads |
|---|---|
| core (#921) | `/api/plants/1`, `/api/care/log` |
| map (#922) | `/api/maps`, `/api/objects`, `/api/locations`, `/api/weed-sightings` |
| household (#923) | `/api/users`, `/api/household/members`, `/api/calendar/subscription`, `/api/discover` |

Collapsing them would delete real viewer-access coverage for two entire route
groups. **All three stay.** (Caught by the Codex reviewer on PR #948 — a
useful reminder that a shared test *name* is not evidence of a shared test.)

The *behavioural* tests in these files (viewer create is rejected before a
write lands, owner/editor still can, cross-household is refused) are likewise
not redundant — they exercise runtime behaviour, not route wiring. Delete the
three subsumed inventory meta-tests; keep everything else.

This is the pattern to watch for generally: **each issue spawned a sibling
file instead of extending the existing one.**

### 5b. 35% of backend runtime is two real `sleep`s

```
6.02s  test_icon_generation.py::test_falls_back_to_procedural_on_bad_svg
6.02s  test_icon_generation.py::test_ai_retries_before_procedural_fallback
```

12s of the 34s total. Both are good tests. They are slow because
`routers/admin_panel.py:231` does a real `await asyncio.sleep(2 ** attempt)`
exponential backoff (2s + 4s).

An earlier draft of this audit claimed the tests "cannot patch" this and
recommended adding a production injection seam. **That was wrong, and the fix
is much cheaper than advertised** — `admin_panel` does a plain
`import asyncio`, so the call is patchable as-is, with no production change
at all:

```python
@pytest.fixture(autouse=True)
def _no_backoff():
    with patch("routers.admin_panel.asyncio.sleep", new=AsyncMock()):
        yield
```

Measured with that fixture added to `test_icon_generation.py`:
**12.3s → 0.51s, all 18 tests still passing.** Roughly a third off the backend
suite for a four-line test-only change. (Also caught by the Codex reviewer on
PR #948.) Note the patch swaps `asyncio.sleep` process-wide for the duration
of each test, which is fine here but is the reason to scope it to this file
rather than to `conftest.py`.

### 5c. Brittle exact-copy assertions

Assertions pinned to full user-facing sentences, in both languages:

```python
assert body["response"] == "Basilicum is 2 dagen te laat met water."
assert overdue["reason"] == "Water is 2 dagen te laat"
assert heat_events[0]["action_en"] == "Water early or late; move pots to shade and check containers first."
```

~14 in `test_warnings.py` alone, plus a long tail. **This has already cost
us**: `ci.yml`'s own comment records that #838 reworded a string the camera
tests asserted on and took master red unnoticed (fixed in #843).

These should assert on structure and identity (the key exists, the plant is
the overdue one, both `_nl` and `_en` are non-empty and differ) rather than
on copy — which is exactly what the i18n catalog rules in `CLAUDE.md` are
already pushing towards. This is a *quality* fix, not a deletion, so the
guard does not block it.

### 5d. Stale instructions in `how-we-work.md` that are simply wrong

- **§12 tells every agent to run
  `pytest -q --ignore=tests/test_water_amount.py`.** That file exists and
  **passes in 0.13s**. The exclusion has been copy-pasted by agents since the
  doc was written and silently hides a working test file. Delete the flag.
- **§7 step 7 ("Tell Leon it's ready. DO NOT merge it yourself") and §10
  ("let Leon merge") are false.** `auto-merge.yml` marks the PR ready and
  squash-merges the moment required checks pass, and a merge to master
  deploys to Fly. §1.5 describes this accurately; §7 and §10 contradict it.
  An agent reading §7/§10 believes a human will look at the diff. Nobody
  will. This is the most dangerous inaccuracy in the document.

---

## 6. Recommendations

### Fix the ratchet (the structural one)

1. **Add a scheduled pruning path.** A recurring "test consolidation" issue
   where deletion is the *purpose* of the PR. The guard stays fully armed for
   all normal work; pruning gets a sanctioned lane instead of never happening.

   **Mechanical caveat:** `pr-review.yml` reads
   `github.event.pull_request.labels`, so labelling the *issue* does nothing —
   GitHub does not copy issue labels onto a PR. Leon must apply
   `tests-intentionally-removed` to the **PR**, after it exists. Since
   labelling re-runs the workflow with no new push, that is one click at
   review time — but it does mean this lane still needs Leon in the loop once
   per pruning PR, and the recommendation should not be written as if the
   authorisation can be granted in advance. (Caught by the Codex reviewer on
   PR #948.)
2. **Add a rule to `how-we-work.md` §8:** before adding a test *file*, check
   whether one already covers that surface and extend it. New file only for a
   genuinely new surface. This is what would have prevented §5a.
3. **State a value bar for new tests.** Something like: a test earns its place
   if it would have caught a real defect, or pins a contract someone could
   plausibly break. "It increases coverage" is not a reason. The suite's
   existing incident-citing docstrings are already the model — make that
   convention explicit.

### Then the four specific fixes

4. Consolidate the viewer authz inventory meta-tests (§5a) — needs the label.
5. Add the `_no_backoff` fixture to `test_icon_generation.py` (§5b) — test-only, no label needed, −12s (verified).
6. Loosen the exact-copy assertions to structural ones (§5c) — no label needed.
7. Correct §12's stale `--ignore` flag and the §7/§10 merge contradiction (§5d).

---

## 7. On loosening `how-we-work.md` because models improved

The document was written for a fleet of cheap DeepSeek executors doing "most
of the coding volume" (§0).

**Correction to an earlier draft of this section.** That draft searched commit
trailers for "deepseek", found nothing, and concluded the executor lane "never
materialised in the git record". That was a bad search, not a finding: DeepSeek
ran through **Hermes**, and its commits are attributed
`Co-authored-by: Hermes Agent`. The lane was real and did substantial work.

What the git record actually shows:

| Signal | Count |
|---|---|
| Total commits in history | 1081 |
| Commits carrying **at least one** co-author trailer | 500 |
| **Commits with no co-author trailer at all** | **581** |
| `Co-authored-by: Hermes Agent` | 10 (all 2026-06-06 → 2026-06-10) |

Untrailed commits by month: 2026-04: 2 · 05: 245 · 06: 136 · 07: 137 · 08: 61
— summing to 581.

**More than half of this repository's history is unattributed.** That is the
number that matters: git cannot tell us who wrote those commits, so the 10
Hermes trailers are a floor, not a count. Anyone reasoning about "who does the
work here" from trailers alone — as the earlier draft did — will get it wrong.
Leon's recollection is that DeepSeek-via-Hermes did a lot of the volume, and
nothing in the git record contradicts that.

> **Two measurement bugs, both caught in review, both worth recording** — this
> section is about a faulty git audit, so its own arithmetic has to survive
> inspection:
>
> 1. An earlier revision put the untrailed total at **337**, from
>    `1081 − 744`. That subtracts a *line* count from a *commit* count:
>    `git log --pretty=format:"%b" | grep -c` counts trailer **lines**, and 747
>    trailer lines span only 500 commits because some commits carry several.
>    The DeepSeek reviewer caught it on PR #949 by noticing the month
>    breakdown could not sum to the stated total.
> 2. Recounting per-commit first gave **580**, one short. `git log
>    --pretty=format:` emits no trailing newline, so `while read` silently
>    discards the final commit. Appending a newline before the loop gives 581
>    and makes the month breakdown sum exactly.

What does hold up is the narrower, present-tense claim: **the last 150 commits
carry no Hermes trailer**, and the explicit Hermes cluster is a five-day window
in June. So §0's two-lane split describes how work was organised *then*, not
how it is organised now.

And the capability premise has moved underneath it too. `llm_config.py` now
pins `deepseek-v4-pro-0813` for general calls and `deepseek-v4-flash-0731` for
fun facts — both substantially stronger than the Flash build the guardrails in
this document were written against. The argument for loosening is therefore
*stronger* than the earlier draft's version of it, and rests on better ground:
not "the executors never existed" but "the executors were real, and they have
since got much better."

So yes — parts of it are miscalibrated. But the split matters: some rules are
about *model capability* and have genuinely relaxed; others are about
*concurrency and blast radius* and have not changed at all.

**Safe to loosen — these were capability hedges:**

- **§0's team model.** Rewrite for what actually runs: capable agents in
  parallel, no executor/planner caste. The `ready-for-agent` /
  `ready-for-human` labels can stay as difficulty routing, but stop
  describing them as different species of agent.
- **The opening "If a step is unclear… STOP and ask Leon" and §1.7 "When
  unsure, stop and ask."** Written for a model that guesses badly. The better
  rule now: *make the call, and state the assumption explicitly in the PR
  body.* Reserve stopping for decisions that are actually Leon's — product
  direction, anything irreversible, anything touching money or user data.
  Blocking on every ambiguity wastes the capability we now have.
- **§10's "keep changes small"** as an absolute. A coupled refactor landing as
  one coherent PR is now usually better than three that leave master in
  intermediate states.

**Do NOT loosen — none of these are about model quality:**

- **§1.1 worktree isolation.** This is about two processes sharing a folder.
  A better model still corrupts a concurrent checkout.
- **§1.2 never commit secrets.** Obvious.
- **§1.5 green CI = live in production.** If anything this deserves *more*
  emphasis, not less. With auto-merge there is no human between a passing
  check and floreren.app. The doc should lead with this rather than burying
  it, and §7/§10 must stop implying otherwise.
- **The `test-guard` itself.** The temptation is to argue "a good model
  wouldn't delete a failing test, so drop the guard." But the guard costs
  almost nothing on honest work and is the only thing standing between a bad
  day and a silently weakened suite shipping straight to production. Keep it
  armed; give it the deliberate release in recommendation 1 instead.

**The one-line summary:** loosen the rules that assumed the agent was weak;
keep every rule that assumed the deploy pipeline was unforgiving — because it
still is.
