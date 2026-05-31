#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Create / list / remove isolated git worktrees so multiple agents can work in
  parallel without sharing one working folder. See docs/agents/how-we-work.md (§5).

.DESCRIPTION
  Each worktree is a sibling folder of the repo (e.g. ../floreren-13) checked out on
  its own branch, branched off the latest origin/master. Agents work there and merge
  back to master via a PR.

.EXAMPLE
  ./scripts/agent-worktree.ps1 new 13 map-sun-cells
  # -> ../floreren-13 on branch fix/13-map-sun-cells (off latest origin/master)

.EXAMPLE
  ./scripts/agent-worktree.ps1 list

.EXAMPLE
  ./scripts/agent-worktree.ps1 remove 13
  # -> removes the ../floreren-13 folder (the branch is kept; delete it with
  #    'git branch -D fix/13-...' once it's merged)
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('new', 'list', 'remove')]
  [string]$Action,

  [string]$Issue,   # issue number, e.g. 13
  [string]$Slug     # short description, e.g. map-sun-cells (only for 'new')
)

$ErrorActionPreference = 'Stop'

# Always operate from the repo root.
$repo = (git rev-parse --show-toplevel).Trim()
Set-Location $repo
$parent = Split-Path $repo -Parent
$base = 'floreren'   # worktree folders are named <base>-<issue>

function Get-WorktreeDir([string]$issue) { Join-Path $parent "$base-$issue" }

switch ($Action) {
  'new' {
    if (-not $Issue) { throw "Usage: agent-worktree.ps1 new <issue> <slug>" }
    $branch = if ($Slug) { "fix/$Issue-$Slug" } else { "fix/$Issue" }
    $dir = Get-WorktreeDir $Issue
    if (Test-Path $dir) { throw "Folder already exists: $dir" }

    git fetch origin master
    git worktree add $dir -b $branch origin/master
    Write-Host ""
    Write-Host "✓ Worktree ready" -ForegroundColor Green
    Write-Host "  folder: $dir"
    Write-Host "  branch: $branch (off origin/master)"
    Write-Host "  next:   cd `"$dir`"  then do the work, test, and open a PR."
  }
  'list' {
    git worktree list
  }
  'remove' {
    if (-not $Issue) { throw "Usage: agent-worktree.ps1 remove <issue>" }
    $dir = Get-WorktreeDir $Issue
    git worktree remove $dir
    Write-Host "✓ Removed worktree: $dir" -ForegroundColor Green
    Write-Host "  (the branch is kept — 'git branch -D fix/$Issue-...' to delete it once merged)"
  }
}
