# WSL Compatibility Audit — how-we-work.md

**Date:** 2026-05-31
**Auditor:** Oink (DeepSeek agent running in WSL2)
**Scope:** `docs/agents/how-we-work.md` — gaps between the guide's Windows/PowerShell assumptions and the WSL environment where executor agents actually run.

---

## 1. `gh` CLI — not in WSL PATH

**Where in guide:** §§ 6, 7, 11 (cheat sheet)

**Problem:**
The guide assumes `gh` is on PATH. On this WSL setup, `gh` exists only on Windows:
```
C:\Program Files\GitHub CLI\gh.exe
```
Running bare `gh issue list` from bash fails with "command not found".

**Fix options:**
- Add a symlink in WSL: `sudo ln -s /mnt/c/Program\ Files/GitHub\ CLI/gh.exe /usr/local/bin/gh`
- Or call via `powershell.exe gh ...` — works but is slower and awkward in scripts

**Recommendation:** Add a one-time setup step to `how-we-work.md` §5 (First run in a fresh worktree) or a new §0.5 section:

```bash
# One-time: make gh + flyctl available in WSL
sudo ln -s /mnt/c/Program\ Files/GitHub\ CLI/gh.exe /usr/local/bin/gh
sudo ln -s /mnt/c/Users/leon_/.fly/bin/flyctl.exe /usr/local/bin/flyctl
```

After this, all `gh` and `flyctl` commands in the guide work as written.

---

## 2. `flyctl` — same problem as gh

**Where in guide:** §9 (deployment) and `CLAUDE.md`

**Problem:**
`flyctl` is at `C:\Users\leon_\.fly\bin\flyctl.exe` — only on Windows, not in WSL PATH.

Same fix: symlink alongside `gh`.

---

## 3. agent-worktree.ps1 — PowerShell only

**Where in guide:** §5

**Problem:**
The example shows:
```powershell
./scripts/agent-worktree.ps1 new 13 map-sun-cells
```
This is pure PowerShell. Running from WSL requires:
```bash
powershell.exe -ExecutionPolicy Bypass -File ./scripts/agent-worktree.ps1 new 13 map-sun-cells
```
Which works but is verbose and fragile (ExecutionPolicy, path conversion in PS vs bash).

The raw git commands are documented as a fallback, but the guide leads with the PS script as the primary method.

**Fix options:**
- (A) Write a bash sibling: `scripts/agent-worktree.sh` with identical interface
- (B) Update examples to show both PS and bash invocations

**Recommendation:** Option A — a bash shell script keeps WSL agents fast and avoids PS execution policy issues. The PS script stays for Windows/human use.

---

## 4. Venv path — Windows format in guide

**Where in guide:** §5 — "First run in a fresh worktree"

**Problem:**
The guide says:
```bash
cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt && cd ..
```
`.venv/Scripts/python` is the Windows format. In WSL, `python -m venv .venv` creates a venv with `.venv/bin/python` (POSIX layout). Running `.venv/Scripts/python` fails in WSL.

**Fix:**
```bash
cd backend && python -m venv .venv && .venv/bin/python -m pip install -r requirements.txt && cd ..
```
The Python 3 `venv` module auto-detects the platform, so `python -m venv .venv` is correct either way — only the executable path differs after creation.

---

## 5. Testing commands — backend path separator

**Where in guide:** §8

**Problem:**
The guide uses:
```bash
cd backend && python -m pytest -q --ignore=tests/test_water_amount.py
```
This works fine in WSL — no issue here. (Just noting it for completeness.)

**However:** The `--ignore` path uses a forward slash which is correct for both platforms. No change needed.

---

## 6. `npm install` in fresh worktrees — works on WSL

**Where in guide:** §5

**Assessment:**
The guide says:
```bash
cd frontend && npm install && cd ..
```
This works natively on WSL — Node v22.22.3 and npm 10.9.8 are both installed in the WSL environment. No change needed.

---

## 7. `npx tsc --noEmit` — works on WSL

**Where in guide:** §8

**Assessment:**
`npx` is available in WSL. Works as written. No change needed.

---

## 8. Worktree first-run — also need deps for backend tests in WSL

**Where in guide:** §5

**Observation:**
The guide covers `npm install` and venv creation for a fresh worktree. In WSL, `cd backend && .venv/bin/python -m pip install -r requirements.txt` is the equivalent command. No change needed beyond the venv path fix (point 4 above).

---

## Summary of changes needed

| # | What | Where | Priority |
|---|---|---|---|
| 1 | Add symlink step for `gh` CLI | New §0.5 or §5 "First run" | 🔴 Required |
| 2 | Add symlink step for `flyctl` | Same section | 🔴 Required |
| 3 | Add bash worktree script OR show bash invocation | §5 (worktree section) | 🟡 Nice to have |
| 4 | Change `.venv/Scripts/python` → `.venv/bin/python` | §5 "First run" | 🔴 Required |
| 5 | Add a note about PS vs bash where the guide assumes PS | Throughout | 🟢 Minor |

---

## Appendix: tool availability matrix (this WSL setup)

| Tool | Available in WSL? | Path / Notes |
|---|---|---|
| `python3` | ✅ | `/usr/bin/python3` — 3.14.4 |
| `pip3` | ✅ | `/usr/bin/pip3` |
| `node` | ✅ | `/home/leon_/.local/bin/node` — v22.22.3 |
| `npm` | ✅ | v10.9.8 |
| `npx` | ✅ | v10.9.8 |
| `git` | ✅ | Bundled with WSL |
| `gh` | ❌ | Windows-only: `C:\Program Files\GitHub CLI\gh.exe` |
| `flyctl` | ❌ | Windows-only: `C:\Users\leon_\.fly\bin\flyctl.exe` |
| `docker` | ✅ | Docker Desktop WSL integration |
| `powershell.exe` | ✅ | Bridge command for Windows-native tools |
