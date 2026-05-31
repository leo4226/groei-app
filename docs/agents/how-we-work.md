# How We Work — Floreren Agent Guide

Read this whole file before doing anything. It explains how this project is
organised and the exact steps to do work in it.

**If a step is unclear, or a command fails, or you are unsure: STOP and ask the
human (Leon). A wrong guess is worse than a question.**

---

## 0. Who you are

You are a coding assistant for **Floreren**, a plant-care web app. Your job:
1. Pick up a task from **GitHub Issues**.
2. Fix it in the code on a **branch**.
3. Open a **pull request** for Leon to review and merge.

You do **not** invent work. You work from Issues. You do **not** merge your own
work or deploy — Leon does that.

---

## 1. Golden rules (never break these)

1. **Never commit directly to `master`.** `master` is the live code real users get.
   Always work on a new branch.
2. **Never commit secrets.** API keys live in `.env` files, which are git-ignored.
   Never add a `.env` file or a key to git.
3. **Always run the tests before committing.** If tests fail because of your change,
   fix them. Do not commit broken code.
4. **One issue → one branch → one pull request.** Keep each change small and focused.
5. **Do not rewrite git history, delete branches, or delete tags.**
6. **Match the existing code style** in the file you are editing.
7. **When unsure, stop and ask.**

---

## 2. The two places work lives (do not mix them up)

| System | Where | What goes here | Example |
|---|---|---|---|
| **Ideas log** | the file `docs/plans/TODO.md` | Half-formed thoughts, "maybe we should…", things to explore later. **Not bugs.** | "Maybe base plant suggestions on soil moisture too" |
| **Issue tracker** | **GitHub Issues** (repo `leo4226/groei-app`) | Concrete bugs and tasks that need doing | "Tapping a sunny map cell shows shade plants" |

**You work from GitHub Issues, not from `TODO.md`.** `TODO.md` is Leon's private
scratchpad. If Leon points you at a TODO idea and says "make this real", first turn
it into an Issue (see §5), then work the Issue.

---

## 3. Labels (how issues are sorted)

Every issue has labels. Two kinds matter to you.

### a) Triage state — where the issue is in its life
| Label | Meaning | Can you work on it? |
|---|---|---|
| `needs-triage` | New, not yet reviewed by Leon | ❌ No |
| `needs-info` | Waiting on more info from Leon | ❌ No |
| `ready-for-agent` | Fully specified, ready to implement | ✅ **Yes — this is your work** |
| `ready-for-human` | Needs a human | ❌ No |
| `wontfix` | Decided against | ❌ Ignore |

### b) Difficulty — how hard it is
| Label | Stars | Meaning |
|---|---|---|
| `difficulty: easy` | ⭐ | Quick, low-risk |
| `difficulty: medium` | ⭐⭐ | Moderate effort |
| `difficulty: hard` | ⭐⭐⭐ | Big or tricky |

Other labels you may see: `bug`, `enhancement`, `documentation`, `stekkie` (chatbot).

**Which issue to pick:** an issue labelled `ready-for-agent`. Prefer lower difficulty
first, unless Leon says otherwise. Leon does the triage (moving issues to
`ready-for-agent`); you don't.

---

## 4. The full workflow

```
Leon's idea ──► TODO.md            (just a thought)
Leon's bug  ──► GitHub Issue       (needs-triage)
                     │
                Leon triages it  ──► ready-for-agent + a difficulty label
                     │
                     ▼
   YOU:  pick it ► branch ► fix ► test ► open PR ► (Leon reviews & merges) ► deployed
```

---

## 5. Issue commands (use the `gh` CLI)

`gh` auto-detects the repo when you run it inside the project folder.

```bash
# See what you can pick up
gh issue list --label "ready-for-agent" --state open

# Read one issue fully, including comments
gh issue view <number> --comments

# Create an issue (e.g. turning a TODO idea into a real task)
gh issue create --title "🐛 short description" \
  --label "bug,needs-triage" \
  --body "What is wrong, where in the app, and how to reproduce it."

# Leave a progress comment
gh issue comment <number> --body "Working on this; root cause is X."

# Add a difficulty label
gh issue edit <number> --add-label "difficulty: medium"
```

To make a pull request close an issue automatically, write `Closes #<number>` in the
PR description.

---

## 6. Making a code change — exact steps

```bash
# 1. Start from the latest master
git checkout master
git pull

# 2. Make a branch named after the issue
git checkout -b fix/<issue-number>-short-slug      # e.g. fix/13-sun-per-month

# 3. Edit the code. Match the style already in the file.

# 4. RUN THE TESTS (see §7). Fix anything you broke.

# 5. Stage ONLY the files you changed, then commit
git add path/to/file1 path/to/file2
git commit -m "fix(scope): what changed (#<issue-number>)"

# 6. Push and open a pull request
git push -u origin HEAD
gh pr create --fill --base master      # then add "Closes #<issue-number>" to the body

# 7. Tell Leon it's ready. DO NOT merge it yourself.
```

### Commit message format (conventional commits)
`type(scope): short summary (#issue)`
- `type` is one of: `feat` (new feature), `fix` (bug), `docs`, `refactor`, `chore`, `test`.
- Example: `fix(map): sunny cells no longer suggest shade plants (#13)`

---

## 7. Testing — always before committing

```bash
# Backend (Python). The water_amount test is broken for unrelated reasons — skip it.
cd backend
python -m pytest -q --ignore=tests/test_water_amount.py

# Frontend (TypeScript) — must print nothing and exit 0
cd ../frontend
npx tsc --noEmit
```

- If a test fails **because of your change** → fix it.
- If a test was **already failing before** your change → say so in the PR and continue.

---

## 8. The project in one minute

- **Frontend:** React + TypeScript + Vite + Tailwind, in `frontend/`. Deploys to
  **Vercel** (`floreren.app`).
- **Backend:** FastAPI + Python, in `backend/`. Deploys to **Fly.io** (app
  `floreren-api`, served at `api.floreren.app`).
- **Database:** PostgreSQL (Neon) in production, SQLite locally.
- **AI features** (plant ecology, care tips, plant suggestions, chatbot) call a language
  model through **OpenRouter**. ALL of that config lives in ONE file:
  `backend/llm_config.py` (model `deepseek/deepseek-chat`, key from the env var
  `OPENROUTER_API_KEY`). If you touch AI code, read that file first. Never hardcode an
  API URL or key anywhere else.
- **Run locally:** `npm run dev` (starts frontend + backend together).
- Deep infra / deployment details are in `CLAUDE.md` at the repo root.

---

## 9. Do / Don't

**Do**
- Work from `ready-for-agent` issues.
- Branch → test → PR, and let Leon merge.
- Keep changes small and focused on one issue.
- Ask when unsure.

**Don't**
- Commit to `master` directly.
- Commit a `.env` file or any secret/API key.
- Merge your own pull request, or deploy.
- Start work on `needs-triage`, `needs-info`, or `ready-for-human` issues.
- Rewrite git history, or delete branches/tags.
- Change `CLAUDE.md`, deploy configs, or `backend/llm_config.py` unless the issue is
  specifically about them.

---

## 10. Cheat sheet

```bash
# find work
gh issue list --label "ready-for-agent" --state open
gh issue view <n> --comments

# do the work
git checkout master && git pull
git checkout -b fix/<n>-slug
#   ...edit files...
cd backend && python -m pytest -q --ignore=tests/test_water_amount.py
cd ../frontend && npx tsc --noEmit
git add <changed files>
git commit -m "fix(scope): summary (#<n>)"
git push -u origin HEAD
gh pr create --fill --base master        # PR body must contain: Closes #<n>
# then tell Leon — do not merge yourself
```
