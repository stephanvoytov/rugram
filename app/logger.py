"""Centralized logger for Rugram.

Single class that handles all logging destinations:
  - Console (colored, dev-friendly via structlog)
  - File (rotating JSON, for production tracing)
  - SystemEvent DB table (for admin panel at /admin/events)

Usage:
    from app.logger import log

    log.info("user_registered", user_id=42, username="alice")
    log.warning("push_failed", user_id=42, error=str(e))
    log.error("db_timeout", query="get_feed", duration_ms=5200)
    log.critical("disk_full", path="/data")
    log.exception("chat_load_error")          # includes traceback

    # Explicit system event (visible in admin panel regardless of level):
    log.system_event("info", "auth", "User logged in", details={"ip": "..."})
"""

import logging
import os
from pathlib import Path
from typing import Any

import structlog
from structlog.stdlib import ProcessorFormatter

LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
LOG_FILE = LOG_DIR / "rugram.jsonl"
_LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()


class AppLogger:
    """Unified logger: console + file + SystemEvent DB (admin panel)."""

    def __init__(self) -> None:
        self._logger: structlog.stdlib.BoundLogger = structlog.get_logger()

    # ── Standard methods ──────────────────────────────────────────────

    def debug(self, event: str, **kwargs: Any) -> None:
        self._logger.debug(event, **kwargs)

    def info(self, event: str, **kwargs: Any) -> None:
        self._logger.info(event, **kwargs)

    def warning(self, event: str, **kwargs: Any) -> None:
        self._logger.warning(event, **kwargs)

    def error(self, event: str, **kwargs: Any) -> None:
        """Log at ERROR level AND persist to SystemEvent DB (admin panel)."""
        self._logger.error(event, **kwargs)
        self._write_system_event("error", "system", event, **kwargs)

    def critical(self, event: str, **kwargs: Any) -> None:
        """Log at CRITICAL level AND persist to SystemEvent DB (admin panel)."""
        self._logger.critical(event, **kwargs)
        self._write_system_event("critical", "system", event, **kwargs)

    def exception(self, event: str, **kwargs: Any) -> None:
        """Log with exception traceback AND persist to SystemEvent DB."""
        self._logger.exception(event, **kwargs)
        self._write_system_event("error", "system", event, **kwargs)

    # ── Admin-panel helper ────────────────────────────────────────────

    def system_event(self, level: str, category: str, message: str, details: Any = None) -> None:
        """Write directly to SystemEvent DB (always visible in admin panel).

        Levels: critical | error | warning | info
        Categories: push | db | auth | chat | upload | system
        """
        self._logger.info("system_event", level=level, category=category, message=message)
        self._write_system_event(level, category, message, _details=details)

    # ── Internal ──────────────────────────────────────────────────────

    @staticmethod
    def _write_system_event(level: str, category: str, event: str, **kwargs: Any) -> None:
        """Insert a row into SystemEvent table (best-effort, never raises)."""
        try:
            from app.routes.helpers import log_system_event as _lse

            # Strip internal keys that shouldn't go to DB
            safe = {
                k: v
                for k, v in kwargs.items()
                if k not in ("event", "level", "category", "message")
            }
            _details = safe.pop("_details", None)
            details = _details if _details is not None else (safe or None)
            _lse(level=level, category=category, message=event, details=details)
        except Exception:
            pass  # Never break the app because of logging


# ── Module-level singleton ────────────────────────────────────────────────────
log = AppLogger()


def setup_logging() -> None:
    """Configure structlog + file handlers. Call once at app startup."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    shared_processors = [
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]

    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            *shared_processors,
            structlog.dev.ConsoleRenderer(),
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Standard library root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(_LOG_LEVEL)

    # JSON file handler (rotating, 10 MB per file, keep 5)
    from logging.handlers import RotatingFileHandler

    file_handler = RotatingFileHandler(
        LOG_FILE,
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setLevel(_LOG_LEVEL)
    file_handler.setFormatter(
        ProcessorFormatter(
            processor=structlog.processors.JSONRenderer(),
            foreign_pre_chain=shared_processors,
        )
    )
    root_logger.addHandler(file_handler)

    # Suppress noisy libraries
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
