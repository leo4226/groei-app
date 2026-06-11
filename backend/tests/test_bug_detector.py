"""Unit tests for the bug detector's pure functions (backend/scripts/bug_detector.py).

The detector itself runs in GitHub Actions (.github/workflows/bug-detector.yml);
these tests cover the log parsing, signature building, and dedup logic so CI
guards the loop's own plumbing.
"""
from scripts.bug_detector import (
    extract_error_signatures,
    issue_signature,
    filter_new_findings,
    Finding,
)


FLY_LOGS = """\
2026-06-11T05:12:01Z app[2876921a] ams [info] INFO:floreren:GET /api/dashboard 200
2026-06-11T05:13:44Z app[2876921a] ams [info] ERROR:floreren:Unhandled exception: no such column: p.care_profile
2026-06-11T05:13:44Z app[2876921a] ams [info] Traceback (most recent call last):
2026-06-11T05:13:44Z app[2876921a] ams [info]   File "/app/routers/calendar.py", line 80, in list_calendar_events
2026-06-11T05:15:02Z app[2876921a] ams [info] ERROR:floreren:Unhandled exception: no such column: p.care_profile
2026-06-11T06:01:10Z app[2876921a] ams [info] ERROR:floreren:Failed to send email to x@y.z: timeout
2026-06-11T06:02:00Z app[2876921a] ams [info] INFO:floreren:POST /api/care 200
"""


def test_extract_error_signatures_groups_duplicates():
    findings = extract_error_signatures(FLY_LOGS)
    messages = [f.detail for f in findings]
    # Two distinct errors, the repeated unhandled exception collapsed to one
    assert len(findings) == 2
    assert any("no such column: p.care_profile" in m for m in messages)
    assert any("Failed to send email" in m for m in messages)
    dup = next(f for f in findings if "care_profile" in f.detail)
    assert dup.count == 2


def test_extract_error_signatures_includes_context_line():
    findings = extract_error_signatures(FLY_LOGS)
    dup = next(f for f in findings if "care_profile" in f.detail)
    # The traceback File line right after the error is captured as context
    assert "routers/calendar.py" in dup.context


def test_extract_error_signatures_empty_logs():
    assert extract_error_signatures("") == []
    assert extract_error_signatures("2026-06-11 [info] INFO: all fine") == []


def test_issue_signature_is_stable_and_normalises_volatile_parts():
    a = Finding(kind="exception", detail="Unhandled exception: timeout for account 12", context="")
    b = Finding(kind="exception", detail="Unhandled exception: timeout for account 99", context="")
    # Numbers are normalised so the same error for different ids dedupes together
    assert issue_signature(a) == issue_signature(b)
    c = Finding(kind="health", detail="health check failed", context="")
    assert issue_signature(a) != issue_signature(c)


def test_filter_new_findings_drops_known_signatures():
    f1 = Finding(kind="exception", detail="boom", context="")
    f2 = Finding(kind="health", detail="health check failed", context="")
    existing = {issue_signature(f1)}
    fresh = filter_new_findings([f1, f2], existing)
    assert fresh == [f2]
