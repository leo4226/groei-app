# Stekkie suggested actions: implementation and production cutover

## Status

PR #739 now contains the implementation for issue #410. The worker is tracked in the Floreren repository instead of being maintained only in `C:\Projects\leonnetje-server`.

Tracked files:

- `backend/stekkie_worker.py`: FastAPI worker, model fallback, deterministic action resolver, token validation, and privacy-safe usage logging.
- `backend/stekkie_knowledge_base.md`: concise feature and safety reference.
- `backend/tests/test_stekkie_worker.py`: worker contract and intent tests.
- `scripts/start-stekkie-worker.ps1`: foreground launcher for manual operation and diagnostics.

The existing untracked worker under `C:\Projects\leonnetje-server` remains the live source until the coordinated cutover below. Do not delete it before the tracked worker has passed the production smoke checks.

## Response contract

`POST /chat` always returns prose and may include one action:

```json
{
  "response": "Goed bijgehouden.",
  "suggested_action": {
    "type": "mark_care_done",
    "label": "Markeer water voor Basilicum als gedaan",
    "payload": {
      "plant_id": 101,
      "schedule_id": 456,
      "care_type": "water"
    }
  }
}
```

`suggested_action` is absent or `null` unless the worker can resolve one unambiguous action from the authenticated household context. The backend validates all IDs and overwrites `requires_confirmation`: navigation is immediate; care completion always requires confirmation.

## Deterministic v1 actions

The LLM produces prose only. `build_suggested_action()` independently resolves an action from the user's message and `garden_context`, so model output cannot invent IDs or arbitrary tools.

Supported navigation targets:

- `plant`: requires one named active plant from `garden_context.plants`.
- `map`: requires one named map and uses its ID or slug from `garden_context.maps`.
- `calendar`: static `/calendar` target.
- `add_plant`: static `/plants/add` target.

Supported care completion types:

- `water`
- `fertilize`
- `prune`
- `repot`
- `mist`
- `rotate`
- `pest_check`
- `dust`

The following types are deliberately excluded:

- `frost_protect` and `heat_protect` are informational advisories with Seen/Restore semantics.
- `moisture_check` requires the dedicated grouped outcome flow.
- ephemeral tasks are never completed through a Stekkie action.

Completion requires explicit past-tense completion intent and exactly one matching care task. Recommendations such as “I should water Basilicum” do not produce a completion button. Ambiguity produces prose without an action.

## Execution safety

The worker only suggests. The application backend remains authoritative:

1. `backend/routers/chat.py` accepts only `navigate` and `mark_care_done`.
2. Household ownership, active plant/map state, care type, and schedule ID are validated before a button is returned.
3. The frontend requires confirmation for care completion.
4. The frontend passes the validated `schedule_id` through the store and API client.
5. `/care/done` targets that exact schedule while remaining backward compatible for callers that omit `schedule_id`.

Malformed, stale, unsupported, or foreign actions are dropped while the prose response remains available.

## Prompt and privacy behaviour

- LLM configuration comes from `backend/llm_config.py`; the worker does not duplicate provider URLs or API keys.
- Structured `garden_context` replaces legacy prose context when present, avoiding the previous duplicate prompt payload.
- Message length, history length, and history-entry length are bounded.
- The feature reference is tracked, concise, and describes current Calendar, Field Guide, weather advisory, and moisture-check behaviour.
- Usage logs contain model, prompt version, token counts, estimated cost, latency, route, action type, and fallback reason.
- Usage logs never contain user messages, replies, plant names, or raw garden context.
- `backend/stekkie_usage.log*` is ignored by Git.

## Worker authentication

`/health` is public. `/chat` validates `X-Worker-Token` only when `CHATBOT_WORKER_TOKEN` is configured. This keeps local development usable while allowing production to reject direct unauthenticated model calls.

The Fly backend sends the same header when its `CHATBOT_WORKER_TOKEN` secret is configured. Never commit or paste the token into source, documentation, logs, issues, or PR comments.

## Local verification before merge

From the repository root:

```bash
cd backend
PYTHONNOUSERSITE=1 PYTHONPATH= .venv/Scripts/python -s -m pytest -q --tb=short

cd ../frontend
./node_modules/.bin/tsc -b --force
npm run lint:i18n
npm run build
```

Run the tracked worker on an isolated port rather than replacing production:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\start-stekkie-worker.ps1 -Port 8012
```

Test `/health`, authenticated Dutch completion intent, authenticated English navigation intent, and rejection without the token. Stop the isolated process after verification.

## Coordinated production migration

Perform this only after PR #739 is merged and the merged `master` is present at `C:\Users\leon_\Projects\Floreren`.

### 1. Prepare a shared token

Generate a fresh random token in Leon's shell and keep it only in a temporary shell variable. Do not print it into agent output or commit it.

### 2. Configure Fly first

Set `CHATBOT_WORKER_TOKEN` on `floreren-api` using `flyctl secrets set ... --remote-only`. This restarts the Fly application. The existing legacy worker does not enforce the token, so receiving the additional header is harmless during this first half of the cutover.

Verify:

- Fly deployment is healthy.
- `https://api.floreren.app/health` succeeds.
- Existing Stekkie chat still works through the app.

### 3. Configure the Windows worker

Set the same value as the persistent Windows user environment variable `CHATBOT_WORKER_TOKEN`. New worker processes inherit it; an already-running process does not.

Update the chatbot section in `C:\Users\leon_\Scripts\start-floreren-workers.ps1`:

- Python: `C:\Users\leon_\Projects\Floreren\backend\.venv\Scripts\python.exe`
- Working directory: `C:\Users\leon_\Projects\Floreren\backend`
- Command: `-m uvicorn stekkie_worker:app --host 127.0.0.1 --port 8002`
- Preserve stdout/stderr redirection and the existing port-health guard.

Do not change the BioCLIP block.

### 4. Replace the worker

Stop only the process listening on port 8002, run the updated worker launcher, and poll `http://127.0.0.1:8002/health` with short bounded requests. Do not run the old and new worker simultaneously.

Verify:

- local `/health` reports the new prompt version;
- public `https://chatbot.floreren.app/health` succeeds;
- direct public `POST /chat` without `X-Worker-Token` returns 401;
- an authenticated request through `https://api.floreren.app/api/chat` succeeds.

If the app proxy fails, immediately restore the legacy chatbot path in the launcher and restart port 8002. Leave the Fly token configured; the legacy worker ignores the header.

### 5. Real in-app NL/EN smoke checks

In Dutch mode:

1. Ensure Basilicum has one ordinary water task in current context.
2. Ask: `Ik heb Basilicum water gegeven`.
3. Confirm a care button appears.
4. Cancel once and verify no care state changes.
5. Ask again, confirm, and verify the exact task advances elsewhere in the app.
6. Ask: `Waar kan ik de kalender vinden?` and verify immediate navigation.

In English mode:

1. Ask: `I watered Basil` for a uniquely named task.
2. Verify the English label and confirmation flow.
3. Ask to open a named plant and named map; verify routes.
4. Ask `Should I water Basil?`; verify that no completion button appears.
5. Ask to complete a heat advisory or moisture check; verify that no generic Done button appears.

After the successful smoke pass, archive `C:\Projects\leonnetje-server` as a rollback snapshot rather than deleting it immediately. Issue #410 can then be closed.
