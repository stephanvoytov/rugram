"""In-memory presence tracking — no DB writes on heartbeat.

Keeps a dict of {user_id: last_heartbeat} in memory.
A background thread flushes stale entries to DB every 60 seconds.
"""

import datetime
import threading

# {user_id: utc_timestamp}
_presence: dict[int, float] = {}
_lock = threading.Lock()
_flush_interval = 30  # seconds between DB flushes


def touch(user_id: int) -> None:
    """Called on every ping — fast, no DB."""
    with _lock:
        _presence[user_id] = datetime.datetime.now(datetime.UTC).replace(tzinfo=None).timestamp()


def is_online(user_id: int, timeout: int = 30) -> bool:
    """Check memory first, then fall back to DB."""
    now = datetime.datetime.now(datetime.UTC).replace(tzinfo=None).timestamp()
    with _lock:
        ts = _presence.get(user_id)
        if ts is not None:
            return (now - ts) < timeout
    return False


def _flush_loop(app):
    """Periodically write stale presence entries to the database."""
    from extensions import db

    with app.app_context():
        while True:
            threading.Event().wait(_flush_interval)
            stale = []
            now = datetime.datetime.now(datetime.UTC).replace(tzinfo=None).timestamp()
            with _lock:
                for uid, ts in list(_presence.items()):
                    if (now - ts) >= _flush_interval:
                        stale.append((uid, ts))
                        del _presence[uid]
            if stale:
                try:
                    for uid, ts in stale:
                        db.session.execute(
                            db.text("UPDATE users SET last_seen = :ts WHERE id = :id"),
                            {
                                "ts": datetime.datetime.fromtimestamp(
                                    ts, tz=datetime.UTC
                                ).replace(tzinfo=None),
                                "id": uid,
                            },
                        )
                    db.session.commit()
                except Exception:
                    db.session.rollback()


def init_presence(app):
    """Start the background flusher thread."""
    thread = threading.Thread(target=_flush_loop, args=(app,), daemon=True, name="presence-flusher")
    thread.start()
