import { useFloreren } from '../store/useFloreren'

/**
 * Server-derived capabilities of the signed-in account — the ONLY thing
 * capability-gated UI may read. Never guess from `role` strings locally:
 * the backend is the source of truth (`_CAPABILITIES_BY_ROLE`), the UI just
 * mirrors it. While the account is still loading, everything reads as
 * not-allowed (safe default: controls stay disabled for a moment rather than
 * enabling a write the server would 403).
 */
export function useCapabilities() {
  const me = useFloreren((s) => s.me)
  const canEdit = me?.capabilities.can_edit ?? false
  const canManageHousehold = me?.capabilities.can_manage_household ?? false
  const isViewer = !canEdit
  return { me, canEdit, canManageHousehold, isViewer }
}
