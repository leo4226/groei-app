# Whisper voice-to-text install — TODO

Frozen 2026-05-16. Resume when ready.

## Goal

Live dictation: hold a hotkey → speak → text appears in whatever window is focused (terminal, Claude Code prompt, anywhere).

## Tool chosen

**WhisperWriter** (https://github.com/savbell/whisper-writer) — Python wrapper around `faster-whisper`, push-to-talk hotkey, types into focused window. Cross-platform; works on Windows.

## Decisions still open

- [ ] Local Whisper (free, private) vs. OpenAI API (paid ~$0.006/min, faster, more accurate)? — leaning **local**
- [ ] Microphone confirmed working? (built-in laptop mic OK for testing; headset much better for daily use)
- [ ] Autostart on Windows boot — yes or no?

## Decisions made

- Model size: **`small` multilingual** (~500 MB, handles Dutch + English, runs OK on CPU). Can switch later.
- Install Python 3.12 alongside existing 3.9 / 3.14 (3.14 too new for PyTorch wheels; 3.9 too old for WhisperWriter).
- Install location: `C:\Users\leon_\Tools\whisper-writer\` with its own venv.

## Install steps (when ready)

1. `winget install Python.Python.3.12`
2. `git clone https://github.com/savbell/whisper-writer C:\Users\leon_\Tools\whisper-writer`
3. `cd C:\Users\leon_\Tools\whisper-writer && py -3.12 -m venv .venv`
4. `.\.venv\Scripts\Activate.ps1`
5. `pip install -r requirements.txt`
6. `python run.py` — first run downloads the model (~500 MB), a few minutes.
7. Configure hotkey + verify "type into focused window" mode in settings UI.
8. Focus terminal → hotkey → speak → release → text appears.

## Existing Python on this machine (snapshot)

- `python` → 3.14.2
- `python3` → not on PATH
- `py -3.9` → 3.9.13 (Microsoft Store install)
- `pip` → 21.1.1, bound to 3.9 (very old — don't reuse)
