"""Prevent opaque personal-calendar credentials from entering app access logs."""
import logging
import re

_FEED_PATH = re.compile(r"(/api/calendar/feed/)[^/?]+(\.ics(?:\?[^ ]*)?)")


class CalendarFeedAccessLogFilter(logging.Filter):
    """Redact only the credential segment in Uvicorn's structured log args."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not isinstance(record.args, tuple) or len(record.args) < 3:
            return True
        path = record.args[2]
        if not isinstance(path, str):
            return True
        redacted = _FEED_PATH.sub(r"\1[redacted]\2", path)
        if redacted != path:
            args = list(record.args)
            args[2] = redacted
            record.args = tuple(args)
        return True
