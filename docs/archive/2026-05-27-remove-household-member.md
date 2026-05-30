# Remove Household Member Feature — Implementation Plan

**Date:** 2026-05-27  
**Goal:** Voeg de mogelijkheid toe om een household member te verwijderen via de Settings pagina.

## Huidige staat

- Backend: `GET /household/members` bestaat (routers/household.py:144-157)
- Frontend API: `household.members()` in client.ts:305
- Frontend UI: Settings.tsx toont al members + invite knop
- Admin heeft al `DELETE /admin/accounts/{id}` maar dat is admin-only, niet household-scoped

## Tasks

### 1. Backend: `DELETE /household/members/{user_id}` endpoint

**File:** `backend/routers/household.py` (na `list_members`)

Voeg na `list_members` een nieuwe endpoint toe. De URL gebruikt `user_id` omdat de Settings UI (`users` uit `useFloreren`) user IDs weergeeft, niet account IDs. Het endpoint matched de user naar het corresponderende account via `(name, household_id)`:

**Flow:**
1. Lookup target user via `(user_id, household_id)` → 404 indien niet gevonden
2. Zoek current user via `(account_name, household_id)` voor self-check en FK reassign
3. Block self-deletion: `if user_id == current_user_id → 400`
4. Zoek corresponderend account via `(name, household_id)` — als account al weg is (zoals bij Lisbeth/Lis), skip de account-delete
5. FK cleanup: `care_log.done_by` → reassign naar current user; `care_schedules.last_done_by`, `garden_water_log.watered_by`, `garden_fertilize_log.fertilized_by` → NULL
6. `DELETE FROM users WHERE id = ?`
7. Optioneel: `DELETE FROM accounts WHERE id = ?`
8. `db.commit()` → `204 No Content`

**Waarom user_id in de URL?**
De "Who's Gardening" sectie in Settings.tsx gebruikt `users` uit de `useFloreren()` store (die `GET /users` aanroept). Users en accounts zijn **niet** 1:1 gelinkt via een FK — ze delen alleen `name` en `household_id`. Het endpoint mapt de user naar het account voor opschoning van beide tabellen.

### 2. Frontend API client: `household.removeMember`

**File:** `frontend/src/api/client.ts` (regel ~305)

Voeg toe aan de `household` export:

```typescript
removeMember: (id: number) => api<void>('DELETE', `/household/members/${id}`),
```

### 3. Frontend UI: verwijder-knop in Settings

**File:** `frontend/src/pages/Settings.tsx`

In de "Who's Gardening" sectie: een ✕-knop toegevoegd die verschijnt bij hover (CSS `group-hover`) op niet-actieve members.

**Click flow:**
1. `window.confirm(t('removeConfirm') + ' ' + user.name + '?')` voor bevestiging
2. `household.removeMember(user.id)` aanroepen
3. Success → `useFloreren.getState().load()` voor volledige store refresh
4. Error → `alert(t('removeError') + ': ' + error.message)`

**i18n keys toegevoegd** (in `nl.ts`, `en.ts`, `translations.ts`):
- `settings.removeConfirm` — bevestigingsvraag
- `settings.removeError` — foutmelding
- `settings.removeMember` — tooltip/label

### 4. ✅ Klaar

Alle drie de taken geïmplementeerd. Eigenaar-check is bewust weggelaten — elke household member kan andere members verwijderen (praktisch voor Leon's use case). Kan later toegevoegd worden als dat nodig blijkt.

## Verificatie

1. `DELETE /household/members/999` → 404 (bestaat niet)
2. `DELETE /household/members/me` → 400 (kan jezelf niet verwijderen)
3. `DELETE /household/members/{ander_household_id}` → 403
4. `DELETE /household/members/{valid_id}` → 204, member verdwenen uit lijst
