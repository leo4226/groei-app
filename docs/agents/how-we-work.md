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

## 0.5 Your environment (WSL vs Windows)

Executor agents (Hermes) run in **WSL2 (bash)**; Leon and Claude may be on **Windows
(PowerShell)**. Almost every command is identical. The differences:

**One-time WSL setup** — `gh` (and `flyctl`) live on the Windows side only, so expose
them to bash once. This reuses the existing Windows GitHub/Fly logins — no re-auth:

```bash
sudo ln -s "/mnt/c/Program Files/GitHub CLI/gh.exe" /usr/local/bin/gh
sudo ln -s "/mnt/c/Users/leon_/.fly/bin/flyctl.exe" /usr/local/bin/flyctl   # only if you deploy
```

`flyctl` is only needed if you deploy — and **agents don't deploy** (Leon does), so
executor agents can skip the second line.

**Path differences** (WSL ↔ Windows), used below:

| Thing | WSL (bash) | Windows (PowerShell) |
|---|---|---|
| Python venv binary | `.venv/bin/python` | `.venv\Scripts\python` |
| Worktree helper | `scripts/agent-worktree.sh` | `scripts/agent-worktree.ps1` |

Everything else (`git`, `npm`, `npx`, `python -m pytest`, forward-slash paths) is the
same in both.

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

## 2. The two places work lives (do not mix them up)

| System | Where | What goes here | Example |
|---|---|---|---|
| **Ideas log** | the file `docs/plans/TODO.md` | Half-formed thoughts, "maybe we should…", things to explore later. **Not bugs.** | "Maybe base plant suggestions on soil moisture too" |
| **Issue tracker** | **GitHub Issues** (repo `leo4226/groei-app`) | Concrete bugs and tasks that need doing | "Map view: south-facing cells show as shaded" |

You work from **GitHub Issues**, not from `TODO.md`. `TODO.md` is Leon's private
scratchpad. If Leon points you at a TODO idea and says "make this real", first turn
it into an Issue (§6), then work the Issue.

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

---

## 5. Isolation: one worktree per agent (important with parallel agents)

Two agents must never share one working folder. A **git worktree** is a separate
folder that shares the same repo history but checks out its own branch — so each
agent works alone and merges to `master` when done.

Use the helper from the repo root — bash (WSL agents) or PowerShell (Windows):

```bash
# WSL / bash
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
# Frontend deps — needed for `npx tsc --noEmit` and `npm run dev`
cd frontend && npm install && cd ..

# Backend venv + deps — needed to run the server or any test that hits the DB
cd backend && python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt          # WSL / Linux
#   .venv\Scripts\python -m pip install -r requirements.txt  # Windows PowerShell
cd ..
```

Then `npm run dev` (from the worktree root) starts frontend + backend together.
If a command fails with "module/package not found", you skipped one of these.

Because each worktree has its **own** `backend/.venv`, a WSL agent's Linux venv never
clobbers Leon's Windows venv in the main repo — another reason agents work in their
own worktree, not the main folder.

`master` is the **integration branch** where everyone's parallel work lands via PRs.

---

## 6. Issue commands (`gh` CLI — auto-detects the repo inside the clone)

```bash
gh issue list --label "ready-for-agent" --state open     # find your work
gh issue view <number> --comments                        # read it fully

# Create an issue (e.g. turning a TODO idea into a real task)
gh issue create --title "🐛 short description" \
  --label "bug,needs-triage" \
  --body "What is wrong, where in the app, and how to reproduce it."

gh issue comment <number> --body "Working on this; root cause is X."   # progress
gh issue edit <number> --add-label "difficulty: medium"                # set difficulty
```

To auto-close an issue when a PR merges, put `Closes #<number>` in the PR body.

---

## 7. Making a code change — exact steps

```bash
# 1. Own isolated workspace off the latest master (see §5)
git fetch origin master
git worktree add ../floreren-<n> -b fix/<n>-short-slug origin/master
cd ../floreren-<n>

# 2. Edit the code. Match the style already in the file.

# 3. RUN THE TESTS (see §8). Fix anything you broke.

# 4. Stage ONLY the files you changed, then commit
git add path/to/file1 path/to/file2
git commit -m "fix(scope): what changed (#<n>)"

# 5. Push and open a pull request
git push -u origin HEAD
gh pr create --fill --base master        # then add "Closes #<n>" to the body

# 6. Tell Leon it's ready. DO NOT merge it yourself.
```

### Commit message format (conventional commits)
`type(scope): short summary (#issue)` — `type` ∈ `feat` `fix` `docs` `refactor`
`chore` `test`.
Example: `fix(map): correct sun heatmap orientation on south cells (#13)`

---

## 8. Testing — always before committing

```bash
# Backend (Python). The water_amount test is broken for unrelated reasons — skip it.
cd backend && python -m pytest -q --ignore=tests/test_water_amount.py

# Frontend (TypeScript) — must print nothing and exit 0
cd frontend && npx tsc --noEmit
```

- Fails **because of your change** → fix it.
- Was **already failing** before your change → note it in the PR and continue.

---

## 9. The project in one minute

- **Frontend:** React + TypeScript + Vite + Tailwind, in `frontend/`. Deploys to
  **Vercel** (`floreren.app`).
- **Backend:** FastAPI + Python, in `backend/`. Deploys to **Fly.io** (app
  `floreren-api`, served at `api.floreren.app`).
- **Database:** PostgreSQL (Neon) in production, SQLite locally.
- **AI features** (ecology, care tips, suggestions, chatbot) call a language model
  through **OpenRouter**. ALL of that config is in ONE file: `backend/llm_config.py`
  (model `deepseek/deepseek-chat`, key from env `OPENROUTER_API_KEY`). If you touch
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

## 11. Cheat sheet

```bash
gh issue list --label "ready-for-agent" --state open
gh issue view <n> --comments

git fetch origin master
git worktree add ../floreren-<n> -b fix/<n>-slug origin/master
cd ../floreren-<n>
#   ...edit...
cd backend && python -m pytest -q --ignore=tests/test_water_amount.py
cd ../frontend && npx tsc --noEmit
git add <changed files>
git commit -m "fix(scope): summary (#<n>)"
git push -u origin HEAD
gh pr create --fill --base master         # PR body must contain: Closes #<n>
# tell Leon — do not merge yourself
```
