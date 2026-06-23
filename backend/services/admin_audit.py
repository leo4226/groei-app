import json
import logging

logger = logging.getLogger(__name__)


async def log_admin_action(
    db,
    account: dict,
    action: str,
    target: str | None = None,
    detail: dict | None = None,
) -> None:
    """Write one row to admin_audit_log. Never raises — log failures are suppressed."""
    try:
        account_id = account.get("account_id") or account.get("id")
        await db.execute(
            "INSERT INTO admin_audit_log (account_id, action, target, detail) VALUES (?, ?, ?, ?)",
            (account_id, action, target, json.dumps(detail, ensure_ascii=False) if detail is not None else None),
        )
        await db.commit()
    except Exception as exc:
        logger.warning("audit log write failed for action=%s: %s", action, exc)
