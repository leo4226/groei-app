import logging

from services.calendar_feed_log_redaction import CalendarFeedAccessLogFilter


def test_access_log_filter_redacts_raw_calendar_feed_token():
    record = logging.LogRecord(
        name="uvicorn.access",
        level=logging.INFO,
        pathname="",
        lineno=0,
        msg='%s - "%s %s HTTP/%s" %d',
        args=(
            "127.0.0.1:1234",
            "GET",
            "/api/calendar/feed/super-secret-token.ics?cache=1",
            "1.1",
            200,
        ),
        exc_info=None,
    )

    assert CalendarFeedAccessLogFilter().filter(record) is True
    assert "super-secret-token" not in record.getMessage()
    assert "/api/calendar/feed/[redacted].ics?cache=1" in record.getMessage()


def test_access_log_filter_leaves_other_paths_unchanged():
    args = ("127.0.0.1:1234", "GET", "/api/calendar/events", "1.1", 200)
    record = logging.LogRecord(
        "uvicorn.access", logging.INFO, "", 0,
        '%s - "%s %s HTTP/%s" %d', args, None,
    )

    CalendarFeedAccessLogFilter().filter(record)

    assert record.args == args