# How We Work — Floreren Agent Guide

Read this whole file before doing anything. It explains how this project is
organised and the exact steps to do work in it.

**If a step is unclear, a command fails, or you are unsure: STOP and ask Leon. A
wrong guess is worse than a question.**

---

## 0. The team — who does what

Several agents work on this project at the same time, plus Leon (the human owner).

| Who | Role |
|---|---|
| **Leon (human)** | Logs ideas & bugs, triages issues, reviews and **merges** all work, deploys. |
| **Claude (planner)** | Writes plans/specs when the goal is fuzzy; takes the hard or ambiguous coding where there's no clear target yet. Picks up `ready-for-human` issues. |
| **DeepSeek agents (executors, several at once)** | Implement well-specified issues in parallel. This is most of the coding volume. Pick up `ready-for-agent` issues. |

If you are a DeepSeek/executor agent, your lane is **`ready-for-agent`** issues. If
you are Claude, your lane is planning + **`ready-for-human`** issues. Either way the
mechanics below are the same.

---

## 0.5 Your environment (Windows only)

Everyone (Leon, all agents) works in **Windows (Git Bash)** — no WSL. All commands
(`git`, `npm`, `npx`, `python -m pytest`, forward-slash paths) work the same way.

Note: Python venv binaries are at `.venv\Scripts\python` (Windows). Use the worktree
helper at `scripts/agent-worktree.ps1` (PowerShell) or `scripts/agent-worktree.sh`
(bash/Git Bash).

---

## 1. Golden rules (never break these)

1. **Work in your own git worktree + branch — never edit `master`'s working folder
   directly.** Other agents may be running at the same moment; sharing one folder
   corrupts everyone's edits and test runs. (See §5 for worktrees. Exception: Leon
   may commit a tiny fix straight to `master` when no agents are running.)
2. **Never commit secrets.** API keys live in `.env` files, which are git-ignored.
   Never add a `.env` file or a key to git.
3. **Always run the tests before committing.** If your change breaks a test, fix it.
   Do not commit broken code.
4. **One issue → one branch → one pull request.** Keep each change focused.
5. **Do not merge your own PR, deploy, rewrite git history, or delete branches/tags.**
   Leon merges and deploys.
6. **Match the existing code style** in the file you're editing.
7. **When unsure, stop and ask.**

---

## 2. Where work lives (do not mix these up)

| System | Where | What goes here | Example |
|---|---|---|---|
| **Ideas log** | the file `docs/plans/TODO.md` | Half-formed thoughts, "maybe we should…", things to explore later. **Not bugs.** | "Maybe base plant suggestions on soil moisture too" |
| **Issue tracker** | **GitHub Issues** (repo `leo4226/groei-app`) | Concrete bugs and tasks that need doing | "Map view: south-facing cells show as shaded" |
| **Full plans** | a file in `.hermes/plans/` **+** one umbrella tracking Issue | A multi-task implementation plan for a larger piece of work, too big for a single throwaway issue | `.hermes/plans/2026-06-05-addplant-robustness.md` ↔ its epic Issue |

You work from **GitHub Issues**, not from `TODO.md`. `TODO.md` is Leon's private
scratchpad. If Leon points you at a TODO idea and says "make this real", first turn
it into an Issue (§6), then work the Issue.

**Full plans** keep their detail in a markdown file under `.hermes/plans/` (the rich,
phase-by-phase document) and get **one umbrella tracking Issue** that links to that
file and carries a task checklist mirroring its phases. The plan file is the source of
truth; the Issue is how the work is claimed, sequenced, and merged. When a plan's
phases touch the same files or must run in order, **one agent works the whole epic as a
unit** (claim it with `in-progress`, §3) rather than fanning the tasks out to parallel
agents. Split a plan into separate Issues only when its slices are genuinely
independent (different files, no ordering).

---

## 3. Labels

### a) Triage state — where the issue is, and **who** works it
| Label | Meaning | Who picks it up |
|---|---|---|
| `needs-triage` | New, not yet reviewed | nobody yet — wait for triage |
| `needs-info` | Waiting on info from Leon | nobody — blocked |
| `ready-for-agent` | Clear, fully specified | **DeepSeek / executor agents** |
| `ready-for-human` | Needs a plan or judgment, no obvious solution | **Claude / Leon** |
| `wontfix` | Decided against | nobody — ignore |

### b) Difficulty — how hard it is
| Label | Stars | Meaning |
|---|---|---|
| `difficulty: easy` | ⭐ | Quick, low-risk |
| `difficulty: medium` | ⭐⭐ | Moderate effort |
| `difficulty: hard` | ⭐⭐⭐ | Big or tricky |

Other labels you may see: `bug`, `enhancement`, `documentation`, `stekkie` (chatbot).
Prefer lower difficulty first unless told otherwise.

### c) `in-progress` — a soft lock (because several agents run at once)
Not a triage state. An agent adds `in-progress` the moment it starts an issue (§7) so
the others skip it. **Only pick issues that are `ready-for-agent` and NOT
`in-progress`.** If you abandon an issue, remove the label so it's free again.

---

## 4. The full workflow

```
Leon's idea ──► TODO.md                 (just a thought)
Leon's bug  ──► GitHub Issue            (needs-triage)
                     │
            Leon/Claude triages  ──► difficulty label + route:
                     │                    ├─ clear & contained ► ready-for-agent  (DeepSeek)
                     │                    └─ needs a plan       ► ready-for-human  (Claude/Leon)
                     ▼
   pick it ► worktree+branch ► fix ► test ► open PR ► (Leon reviews & merges) ► deployed
```

See **`docs/agents/triage-cheatsheet.md`** for the triage step-by-step.

### Which skill to use at each step

The steps above are backed by installed agent skills (Matt Pocock's set, in
`~/.claude/skills/`). When you're on a step, invoke its skill — each one already reads
Floreren's config in `docs/agents/` and follows the rules in this file.

| Step / situation | Skill | Floreren specifics it must honour |
|---|---|---|
| Triage a `needs-triage` issue | `triage` | Our labels + `difficulty: …` + the `in-progress` soft-lock (§3); see `triage-cheatsheet.md`. |
| Fuzzy goal — stress-test before building | `grilling` / `grill-me` | Claude's lane; nail scope before any code. |
| Turn a discussion into a plan + docs | `grill-with-docs` | ADRs → `docs/archive/`, glossary → `CONTEXT.md`, designs → `docs/plans/`. |
| Publish a plan as a PRD | `to-prd` | Creates a GitHub issue (§6), not a file. |
| Break a plan into issues | `to-issues` | Keep a coupled epic as **one** issue (§2); split only if slices are independent. |
| Implement a `ready-for-*` issue | `tdd` + `implement` | Follow §5/§7: claim `in-progress`, own worktree, test (§8), PR with `Closes #n`, never self-merge. |
| Hard bug / regression | `diagnosing-bugs` | Reads `CONTEXT.md` + `docs/archive/`. |
| Mid-merge/rebase conflict | `resolving-merge-conflicts` | — |
| Design or deepen a module | `codebase-design` / `domain-modeling` | Use the glossary's vocabulary (`CONTEXT.md`). |
| Running low on context / handing off | `handoff` | Compact state for the next agent. |

**This file wins.** Where a skill's generic default conflicts with a golden rule (§1) —
e.g. it would edit `master` directly, skip the worktree, or skip the `in-progress`
claim — follow this file, not the skill.

---

## 5. Isolation: one worktree per agent (important with parallel agents)

Two agents must never share one working folder. A **git worktree** is a separate
folder that shares the same repo history but checks out its own branch — so each
agent works alone and merges to `master` when done.

Use the helper from the repo root — bash (Git Bash) or PowerShell (Windows):

```bash
# Git Bash / bash
bash scripts/agent-worktree.sh new 13 map-sun-cells
#  → creates  ../floreren-13   on branch  fix/13-map-sun-cells  off the latest master
bash scripts/agent-worktree.sh list
bash scripts/agent-worktree.sh remove 13      # removes the folder; branch is kept
```

```powershell
# Windows / PowerShell
./scripts/agent-worktree.ps1 new 13 map-sun-cells
./scripts/agent-worktree.ps1 list
./scripts/agent-worktree.ps1 remove 13
```

Or the raw git commands (any shell):

```bash
git fetch origin master
git worktree add ../floreren-13 -b fix/13-map-sun-cells origin/master
#  ...do all your work inside ../floreren-13 ...
git worktree remove ../floreren-13          # when finished
```

### First run in a fresh worktree (do this once per worktree)

A worktree shares git history but **not installed dependencies** — `frontend/node_modules`
and `backend/.venv` are per-folder and git-ignored, so a brand-new worktree starts
without them. Before running the app or backend tests there, set up once:

```bash
# Frontend deps — needed for `npm run build` and `npm run dev`
cd frontend && npm install && cd ..

# Backend venv + deps — needed to run the server or any test that hits the DB
cd backend && python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
cd ..
```

Then `npm run dev` (from the worktree root) starts frontend + backend together.
If a command fails with "module/package not found", you skipped one of these.

Because each worktree has its **own** `backend/.venv`, venvs from different worktrees never clash. Likewise, each worktree has its own `frontend/node_modules`.

`master` is the **integration branch** where everyone's parallel work lands via PRs.

---

## 6. Issue commands (`gh` CLI — auto-detects the repo inside the clone)

```bash
# Find work — list ready-for-agent, then SKIP any row whose labels include
# "in-progress" (another agent already claimed it). The labels show in the output.
# (Use --label, not --search: a just-added label takes seconds to become searchable.)
gh issue list --label "ready-for-agent" --state open
gh issue view <number> --comments                        # read it fully

# Create an issue (e.g. turning a TODO idea into a real task)
gh issue create --title "🐛 short description" \
  --label "bug,needs-triage" \
  --body "What is wrong, where in the app, and how to reproduce it."

# Comment WHEN: a claim comment at the start (§7), then a note if you find something
# worth recording (root cause, a blocker, a decision).
gh issue comment <number> --body "Working on this; root cause is X."
gh issue edit <number> --add-label "difficulty: medium"                # set difficulty
```

To auto-close an issue when a PR merges, put `Closes #<number>` in the PR body.

---

## 7. Making a code change — exact steps

```bash
# 0. READ the issue first — understand every sub-task and any triage notes/comments
gh issue view <n> --comments

# 1. CLAIM it immediately so no other agent grabs the same issue (see §3)
gh issue edit <n> --add-label "in-progress"
gh issue comment <n> --body "🤖 Working on this — <your agent name>."

# 2. Own isolated workspace off the latest master (see §5)
git fetch origin master
git worktree add ../floreren-<n> -b fix/<n>-short-slug origin/master
cd ../floreren-<n>

# 3. Edit the code. Match the style already in the file.

# 4. RUN THE TESTS (see §8). Fix anything you broke.

# 5. Stage ONLY the files you changed, then commit
git add path/to/file1 path/to/file2
git commit -m "fix(scope): what changed (#<n>)"

# 6. Push and open a pull request
git push -u origin HEAD
gh pr create --fill --base master        # then add "Closes #<n>" to the body

# 7. Tell Leon it's ready. DO NOT merge it yourself.
```

If you stop without opening a PR, **free the issue** so another agent can take it:
`gh issue edit <n> --remove-label "in-progress"`. (Once your PR with `Closes #<n>`
merges, the issue closes on its own.)

### Commit message format (conventional commits)
`type(scope): short summary (#issue)` — `type` ∈ `feat` `fix` `docs` `refactor`
`chore` `test`.
Example: `fix(map): correct sun heatmap orientation on south cells (#13)`

---

## 8. Testing — always before committing

```bash
# Backend (Python)
cd backend && python -m pytest -q

# Frontend (TypeScript + production build) — must exit 0
cd frontend && npm run build
```

- Fails **because of your change** → fix it.
- Was **already failing** before your change → note it in the PR and continue.

**Before you open a PR, both must pass locally:** `npm run build` (frontend) and the
backend tests. Run the **build**, not just `tsc --noEmit` — `tsc` is lenient about JSX
nesting (e.g. an unbalanced `</div>`) that Vite's rolldown build rejects, so `tsc` can
pass while the production build and the Vercel deploy fail (see `CLAUDE.md`). CI
(`.github/workflows/ci.yml`) re-runs both on every PR as the `Frontend · tsc + build`
check and a **red ❌ blocks the merge** — so catch it locally. In a fresh worktree, run
`npm install` first (§5) or the build can't run.

---

## 9. The project in one minute

- **Frontend:** React + TypeScript + Vite + Tailwind, in `frontend/`. Deploys to
  **Vercel** (`floreren.app`).
- **Backend:** FastAPI + Python, in `backend/`. Deploys to **Fly.io** (app
  `floreren-api`, served at `api.floreren.app`).
- **Database:** PostgreSQL (Neon) — production AND local dev (`DATABASE_URL`
  required; SQLite remains only as the in-memory seam the tests use).
- **AI features** (ecology, care tips, suggestions, chatbot) call a language model
  through **Nous Portal**. ALL of that config is in ONE file: `backend/llm_config.py`
  (model `deepseek/deepseek-v4-flash`, key from env `NOUS_API_KEY`). If you touch
  AI code, read that file first. Never hardcode an API URL or key anywhere else.
- **Run locally:** `npm run dev` (frontend + backend together).
- Deep infra / deployment details: `CLAUDE.md` at the repo root.

---

## 10. Do / Don't

**Do** — work your lane (`ready-for-agent` for executors, `ready-for-human` for
Claude); use a worktree; test; open a PR; let Leon merge; keep changes small; ask
when unsure.

**Don't** — edit `master`'s folder while others work; commit `.env`/secrets; merge
your own PR or deploy; start `needs-triage` / `needs-info` issues; rewrite history or
delete branches/tags; change `CLAUDE.md`, deploy configs, or `backend/llm_config.py`
unless the issue is specifically about them.

---

## 11. The automated loop (how issues appear and PRs get checked)

Two workflows close the loop around §4 — you don't run them, but you will
see their output:

- **Bug detector** (`.github/workflows/bug-detector.yml`, 5×/day): collects
  real failure signals — `/health` down, `ERROR` lines in Fly logs, failed
  workflow runs on master — and files issues labeled
  `bug, needs-triage, auto-detected`. It never speculates: no signal, no
  issue. Recurring errors dedupe against the open issue via a
  `<!-- detector-sig: ... -->` marker in the body — don't delete that
  comment. Parsing/dedup logic lives in `backend/scripts/bug_detector.py`
  and is unit-tested (`tests/test_bug_detector.py`).
- **PR review** (`.github/workflows/pr-review.yml`, every PR): a
  **blocking** grep-based guard fails the check if a diff deletes tests or
  adds skip/xfail markers (agents may add tests, never weaken them), plus
  an **advisory** adversarial DeepSeek review posted as a PR comment. The
  review is input for Leon — it is not a merge gate and it can be wrong.

The human chain is unchanged: detector files → Leon/Claude triage (set
difficulty + route) → executor agent fixes → CI + review → **Leon merges**.

---

## 12. Cheat sheet

```bash
# find work (skip any row that already shows the "in-progress" label), then read it
gh issue list --label "ready-for-agent" --state open
gh issue view <n> --comments

# claim it so no other agent grabs it
gh issue edit <n> --add-label "in-progress"
gh issue comment <n> --body "🤖 Working on this — <agent name>."

# isolate, work, test
git fetch origin master
git worktree add ../floreren-<n> -b fix/<n>-slug origin/master
cd ../floreren-<n>
#   ...edit...
cd backend && python -m pytest -q --ignore=tests/test_water_amount.py
cd ../frontend && npm run build

# commit, push, PR
git add <changed files>
git commit -m "fix(scope): summary (#<n>)"
git push -u origin HEAD
gh pr create --fill --base master         # PR body must contain: Closes #<n>
# tell Leon — do not merge yourself
# (abandoning? gh issue edit <n> --remove-label "in-progress")
```
