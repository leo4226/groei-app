# Git Workflow — Floreren

A practical guide for solo/small-team development with AI agents.

## The Core Idea

Your code lives in three places:

```
Working directory  →  Local git (committed)  →  GitHub (pushed)
   (unsaved)           (safe locally)           (safe remotely + shareable)
```

You move code forward by committing, then pushing. Going backwards is possible at any step — that's the whole point of git.

---

## Standard Session Flow

### 1. Before starting new work — sync up

```bash
git status              # see what's uncommitted
git pull origin master  # pull latest from GitHub (if others pushed)
```

If `git status` shows uncommitted changes, decide: commit them first, or stash them.

### 2. Create a branch for the work

```bash
git checkout -b feat/short-description   # e.g. feat/dashboard-redesign
```

Work on a branch, not directly on `master`. This keeps `master` stable and lets agents work in parallel on separate branches without interfering with each other.

### 3. Commit frequently while working

Commit after each meaningful chunk — not after every line, not only at the end.

```bash
git add groei/frontend/src/pages/Dashboard.tsx   # stage specific files
git commit -m "feat: regroup dashboard into care columns"
```

Good commit message format: `type: short description`
Types: `feat`, `fix`, `refactor`, `docs`, `chore`

### 4. Push the branch to GitHub

```bash
git push origin feat/short-description
```

Do this regularly — GitHub is your backup. Pushing is cheap; losing work is not.

### 5. Open a Pull Request on GitHub

Go to `github.com/leo4226/groei-app` → the branch will appear with a "Compare & pull request" button. Write what the branch does, then create it.

### 6. Merge into master

On the PR page, click **Merge pull request**. This brings the work into `master` on GitHub.

Then locally:

```bash
git checkout master
git pull origin master   # bring the merged work down locally
git branch -d feat/short-description  # delete the branch (optional, cleanup)
```

---

## Multiple Agents

Branches solve the multi-agent problem. Each agent works in its own branch (or git worktree — an isolated copy of the repo on disk). They can run at the same time without stepping on each other.

The skill `/using-git-worktrees` sets this up automatically for agents. When an agent finishes, its branch gets merged back.

Rule of thumb: **one branch per agent task, never two agents on the same branch at the same time.**

---

## Quick Reference

| Situation | Command |
|---|---|
| See what's changed | `git status` |
| Stage a file | `git add path/to/file` |
| Commit staged files | `git commit -m "type: message"` |
| Push branch to GitHub | `git push origin branch-name` |
| Pull latest from GitHub | `git pull origin master` |
| Create a branch | `git checkout -b feat/name` |
| Switch branch | `git checkout branch-name` |
| See local vs remote | `git log --oneline origin/master..HEAD` |

---

## Current State of This Repo (2026-05-15)

Local `master` is **20 commits ahead** of GitHub — push these first before starting new work:

```bash
git push origin master
```

Then commit the remaining ~60 uncommitted file changes before starting any new feature.
