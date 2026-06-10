#!/usr/bin/env bash
# Create / list / remove isolated git worktrees so multiple agents can work in
# parallel without sharing one working folder. Bash sibling of agent-worktree.ps1
# for Git Bash (Windows). See docs/agents/how-we-work.md (§5).
#
# Usage:
#   bash scripts/agent-worktree.sh new <issue> <slug>   # e.g. new 13 map-sun-cells
#   bash scripts/agent-worktree.sh list
#   bash scripts/agent-worktree.sh remove <issue>
#
# 'new' makes a sibling folder ../floreren-<issue> on branch fix/<issue>-<slug>,
# branched off the latest origin/master. Work there, test, open a PR, then 'remove'.
set -euo pipefail

action="${1:-}"
issue="${2:-}"
slug="${3:-}"

repo="$(git rev-parse --show-toplevel)"
cd "$repo"
parent="$(dirname "$repo")"
base="floreren"   # worktree folders are named <base>-<issue>

case "$action" in
  new)
    [ -n "$issue" ] || { echo "Usage: agent-worktree.sh new <issue> <slug>" >&2; exit 1; }
    branch="fix/${issue}${slug:+-$slug}"
    dir="${parent}/${base}-${issue}"
    [ -e "$dir" ] && { echo "Folder already exists: $dir" >&2; exit 1; }
    git fetch origin master
    git worktree add "$dir" -b "$branch" origin/master
    echo
    echo "✓ Worktree ready"
    echo "  folder: $dir"
    echo "  branch: $branch (off origin/master)"
    echo "  next:   cd \"$dir\"  → install deps (npm install; python3 -m venv .venv …), work, test, open a PR."
    ;;
  list)
    git worktree list
    ;;
  remove)
    [ -n "$issue" ] || { echo "Usage: agent-worktree.sh remove <issue>" >&2; exit 1; }
    dir="${parent}/${base}-${issue}"
    git worktree remove "$dir"
    echo "✓ Removed worktree: $dir"
    echo "  (the branch is kept — 'git branch -D fix/${issue}-…' to delete it once merged)"
    ;;
  *)
    echo "Usage: agent-worktree.sh {new <issue> <slug> | list | remove <issue>}" >&2
    exit 1
    ;;
esac
