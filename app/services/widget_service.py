"""Widget service — fetch + cache profile widgets from external APIs.

Each widget type has its own fetch function.
Cached data (cached_data + cached_at) lives on the ProfileWidget model row.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)

# ── Config keys ──────────────────────────────────────────────────────────────
LASTFM_API_KEY = os.environ.get("LASTFM_API_KEY", "")
STEAM_API_KEY = os.environ.get("STEAM_API_KEY", "")

# ── TTL per widget type (seconds) ────────────────────────────────────────────
TTL: dict[str, int] = {
    "lastfm": 60,
    "weather": 1800,
    "steam": 300,
}

# ── Helpers ──────────────────────────────────────────────────────────────────


def _fetch_json(url: str, timeout: int = 10) -> dict[str, Any] | None:
    """GET a URL, return parsed JSON or None on failure."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "rugram/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError) as e:
        logger.warning("widget fetch failed for %s: %s", url, e)
        return None


def now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


# ── Fetch per type ───────────────────────────────────────────────────────────


def fetch_lastfm(username: str) -> dict[str, Any] | None:
    """Fetch now‑playing / recent track from Last.fm.

    Returns a dict with keys: *now_playing*, *track*, *artist*, *album*, *image*.
    Returns None if the username is wrong or the API is unreachable.
    """
    if not LASTFM_API_KEY:
        return None
    url = (
        "https://ws.audioscrobbler.com/2.0/"
        "?method=user.getRecentTracks"
        f"&user={urllib.request.quote(username)}"
        f"&api_key={LASTFM_API_KEY}"
        "&limit=1&format=json"
    )
    data = _fetch_json(url)
    if not data or "recenttracks" not in data:
        return None
    tracks = data["recenttracks"].get("track")
    if not tracks:
        return None
    track = tracks[0]
    return {
        "now_playing": bool(track.get("@attr", {}).get("nowplaying")),
        "track": track.get("name", "?"),
        "artist": track.get("artist", {}).get("#text", "?"),
        "album": track.get("album", {}).get("#text", "") or None,
        "image": _pick_image(track.get("image", [])),
    }


def _pick_image(images: list[dict]) -> str | None:
    """Pick the largest available image from Last.fm image list."""
    sizes = {"mega": 0, "extralarge": 1, "large": 2, "medium": 3, "small": 4}
    best = None
    best_rank = 99
    for img in images:
        rank = sizes.get(img.get("size", ""), 99)
        text = img.get("#text", "")
        if text and rank < best_rank:
            best = text
            best_rank = rank
    return best


def fetch_weather(city: str) -> dict[str, Any] | None:
    """Fetch current weather from wttr.in (free, no key).

    Returns a dict with keys: *city*, *temp*, *feels_like*, *condition*, *humidity*,
    *wind*, *icon*.
    Returns None on failure.
    """
    url = f"https://wttr.in/{urllib.request.quote(city)}?format=j1"
    data = _fetch_json(url)
    if not data or "current_condition" not in data:
        return None
    cc = data["current_condition"][0]
    return {
        "city": (data.get("nearest_area", [{}])[0].get("areaName", [{}])[0].get("value", city)),
        "temp": cc.get("temp_C", "?"),
        "feels_like": cc.get("FeelsLikeC", "?"),
        "condition": cc.get("weatherDesc", [{}])[0].get("value", "?"),
        "humidity": cc.get("humidity", "?"),
        "wind": f"{cc.get('windspeedKmph', '?')} km/h {cc.get('winddir16Point', '')}",
        "icon": cc.get("weatherCode", None),  # numeric code for icon mapping
    }


def fetch_steam(steam_id: str) -> dict[str, Any] | None:
    """Fetch Steam profile / game status.

    Returns a dict with keys: *persona_name*, *state* (online/offline/busy/…),
    *game* (currently playing game name or None), *game_id*.
    Returns None on failure.
    """
    if not STEAM_API_KEY:
        return None
    url = (
        "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/"
        f"?key={STEAM_API_KEY}&steamids={steam_id}"
    )
    data = _fetch_json(url)
    if not data or "response" not in data:
        return None
    players = data["response"].get("players")
    if not players:
        return None
    p = players[0]
    state_map = {
        0: "offline",
        1: "online",
        2: "busy",
        3: "away",
        4: "snooze",
        5: "looking to trade",
        6: "looking to play",
    }
    return {
        "persona_name": p.get("personaname", "?"),
        "state": state_map.get(p.get("personastate", 0), "offline"),
        "game": p.get("gameextrainfo"),
        "game_id": p.get("gameid"),
        "avatar": p.get("avatarmedium"),
    }


# ── Public API ───────────────────────────────────────────────────────────────


def fetch_widget(widget) -> dict[str, Any] | None:
    """Fetch fresh data for a ProfileWidget instance.

    Returns the new *cached_data* dict (or None on failure).
    Also updates *widget.cached_data* and *widget.cached_at* **in‑memory**
    (caller must commit).
    """
    fetchers: dict[str, callable] = {
        "lastfm": lambda: fetch_lastfm(
            (json.loads(widget.config) if widget.config else {}).get("username", "")
        ),
        "weather": lambda: fetch_weather(
            (json.loads(widget.config) if widget.config else {}).get("city", "")
        ),
        "steam": lambda: fetch_steam(
            (json.loads(widget.config) if widget.config else {}).get("steam_id", "")
        ),
    }
    fn = fetchers.get(widget.widget_type)
    if not fn:
        return None
    data = fn()
    if data is not None:
        widget.cached_data = json.dumps(data)
        widget.cached_at = now()
    return data


def needs_refresh(widget) -> bool:
    """Check if widget cache is stale or missing."""
    if not widget.enabled:
        return False
    if not widget.cached_at:
        return True
    ttl = TTL.get(widget.widget_type, 300)
    age = (now() - widget.cached_at).total_seconds()
    return age > ttl


def get_config_schema() -> dict[str, list[dict]]:
    """Return the config fields each widget type requires (for UI rendering)."""
    return {
        "lastfm": [
            {"key": "username", "label": "Last.fm username", "placeholder": "your_lastfm_username"},
        ],
        "weather": [
            {"key": "city", "label": "City", "placeholder": "Moscow"},
        ],
        "steam": [
            {"key": "steam_id", "label": "Steam ID (64-bit)", "placeholder": "7656119..."},
        ],
    }


def format_widget_data(widget_type: str, data: dict[str, Any] | None) -> dict[str, Any] | None:
    """Normalise widget data for JSON serialisation (ensure safe values)."""
    if data is None:
        return None
    return data
