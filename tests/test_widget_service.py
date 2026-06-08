"""Tests for widget service — fetch + cache with mocked HTTP."""

import json
import urllib.error
from datetime import timedelta
from unittest.mock import MagicMock, patch

from app.services.widget_service import (
    fetch_lastfm,
    fetch_steam,
    fetch_weather,
    fetch_widget,
    get_config_schema,
    needs_refresh,
    now,
    validate_widget_config,
)


def _mock_urlopen(data: dict):
    """Return a mock urllib.request.urlopen context manager that yields `data`."""
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(data).encode()
    mock_resp.__enter__.return_value = mock_resp
    return mock_resp


class TestFetchLastfm:
    def test_returns_track_data(self):
        api_response = {
            "recenttracks": {
                "track": [
                    {
                        "name": "Karma Police",
                        "artist": {"#text": "Radiohead"},
                        "album": {"#text": "OK Computer"},
                        "@attr": {"nowplaying": "true"},
                        "image": [
                            {"size": "small", "#text": "https://example.com/s.jpg"},
                            {"size": "large", "#text": "https://example.com/l.jpg"},
                        ],
                    }
                ]
            }
        }
        with (
            patch("app.services.widget_service.LASTFM_API_KEY", "test_key"),
            patch("urllib.request.urlopen", return_value=_mock_urlopen(api_response)),
        ):
            result = fetch_lastfm("testuser")

        assert result is not None
        assert result["now_playing"] is True
        assert result["track"] == "Karma Police"
        assert result["artist"] == "Radiohead"
        assert result["album"] == "OK Computer"

    def test_returns_none_when_no_key(self):
        with patch("app.services.widget_service.LASTFM_API_KEY", ""):
            result = fetch_lastfm("testuser")
        assert result is None

    def test_returns_none_on_api_error(self):
        with (
            patch("app.services.widget_service.LASTFM_API_KEY", "test_key"),
            patch("urllib.request.urlopen", side_effect=urllib.error.URLError("API down")),
        ):
            result = fetch_lastfm("testuser")
        assert result is None

    def test_returns_none_on_invalid_json(self):
        mock_resp = MagicMock()
        mock_resp.read.return_value = b"not json"
        mock_resp.__enter__.return_value = mock_resp
        with (
            patch("app.services.widget_service.LASTFM_API_KEY", "test_key"),
            patch("urllib.request.urlopen", return_value=mock_resp),
        ):
            result = fetch_lastfm("testuser")
        assert result is None

    def test_handles_missing_tracks(self):
        api_response = {"recenttracks": {"track": []}}
        with (
            patch("app.services.widget_service.LASTFM_API_KEY", "test_key"),
            patch("urllib.request.urlopen", return_value=_mock_urlopen(api_response)),
        ):
            result = fetch_lastfm("testuser")
        assert result is None


class TestFetchWeather:
    def test_returns_weather_data(self):
        api_response = {
            "current_condition": [
                {
                    "temp_C": "22",
                    "FeelsLikeC": "20",
                    "weatherDesc": [{"value": "Partly cloudy"}],
                    "humidity": "45",
                    "windspeedKmph": "12",
                    "winddir16Point": "N",
                    "weatherCode": "116",
                }
            ],
            "nearest_area": [{"areaName": [{"value": "Moscow"}]}],
        }
        with patch("urllib.request.urlopen", return_value=_mock_urlopen(api_response)):
            result = fetch_weather("Moscow")

        assert result is not None
        assert result["temp"] == "22"
        assert result["feels_like"] == "20"
        assert result["condition"] == "Partly cloudy"
        assert result["humidity"] == "45"

    def test_returns_none_on_error(self):
        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("timeout")):
            result = fetch_weather("Moscow")
        assert result is None


class TestFetchSteam:
    def test_returns_player_data(self):
        api_response = {
            "response": {
                "players": [
                    {
                        "personaname": "gamer",
                        "personastate": 1,
                        "gameextrainfo": "Dota 2",
                        "gameid": "570",
                        "avatarmedium": "https://example.com/avatar.jpg",
                    }
                ]
            }
        }
        with (
            patch("app.services.widget_service.STEAM_API_KEY", "test_key"),
            patch("urllib.request.urlopen", return_value=_mock_urlopen(api_response)),
        ):
            result = fetch_steam("7656119")

        assert result is not None
        assert result["persona_name"] == "gamer"
        assert result["state"] == "online"
        assert result["game"] == "Dota 2"

    def test_returns_none_when_no_key(self):
        with patch("app.services.widget_service.STEAM_API_KEY", ""):
            result = fetch_steam("7656119")
        assert result is None

    def test_returns_none_on_api_error(self):
        with (
            patch("app.services.widget_service.STEAM_API_KEY", "test_key"),
            patch("urllib.request.urlopen", side_effect=urllib.error.URLError("API down")),
        ):
            result = fetch_steam("7656119")
        assert result is None

    def test_handles_offline_player(self):
        api_response = {
            "response": {
                "players": [
                    {
                        "personaname": "gamer",
                        "personastate": 0,
                    }
                ]
            }
        }
        with (
            patch("app.services.widget_service.STEAM_API_KEY", "test_key"),
            patch("urllib.request.urlopen", return_value=_mock_urlopen(api_response)),
        ):
            result = fetch_steam("7656119")
        assert result is not None
        assert result["state"] == "offline"
        assert result["game"] is None


class TestFetchWidget:
    def test_updates_cached_data_and_timestamp(self):
        widget = MagicMock()
        widget.widget_type = "weather"
        widget.config = json.dumps({"city": "London"})
        widget.cached_data = None
        widget.cached_at = None

        api_response = {
            "current_condition": [
                {
                    "temp_C": "15",
                    "FeelsLikeC": "13",
                    "weatherDesc": [{"value": "Cloudy"}],
                    "humidity": "60",
                    "windspeedKmph": "10",
                    "winddir16Point": "W",
                    "weatherCode": "119",
                }
            ],
            "nearest_area": [{"areaName": [{"value": "London"}]}],
        }
        with patch("urllib.request.urlopen", return_value=_mock_urlopen(api_response)):
            result = fetch_widget(widget)

        assert result is not None
        assert widget.cached_data is not None
        assert widget.cached_at is not None

    def test_sets_placeholder_on_failure_when_no_cache(self):
        widget = MagicMock()
        widget.widget_type = "weather"
        widget.config = json.dumps({"city": "London"})
        widget.cached_data = None
        widget.cached_at = None

        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("timeout")):
            result = fetch_widget(widget)

        assert result is None  # function returns None on failure
        assert widget.cached_data is not None  # placeholder set
        assert '"placeholder": true' in widget.cached_data

    def test_preserves_old_cache_on_failure(self):
        widget = MagicMock()
        widget.widget_type = "weather"
        widget.config = json.dumps({"city": "London"})
        widget.cached_data = '{"temp": "15"}'
        widget.cached_at = now()

        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("timeout")):
            result = fetch_widget(widget)

        assert result is None
        # Old cache preserved (not overwritten by placeholder)
        assert widget.cached_data == '{"temp": "15"}'

    def test_handles_unknown_type(self):
        widget = MagicMock()
        widget.widget_type = "nonexistent"
        widget.config = "{}"

        result = fetch_widget(widget)
        assert result is None


class TestNeedsRefresh:
    def test_returns_false_when_disabled(self):
        widget = MagicMock()
        widget.enabled = False
        widget.cached_at = None
        assert needs_refresh(widget) is False

    def test_returns_true_when_no_cache(self):
        widget = MagicMock()
        widget.enabled = True
        widget.cached_at = None
        assert needs_refresh(widget) is True

    def test_returns_true_when_stale(self):
        widget = MagicMock()
        widget.enabled = True
        widget.cached_at = now() - timedelta(hours=1)
        widget.widget_type = "lastfm"  # TTL = 60s
        assert needs_refresh(widget) is True

    def test_returns_false_when_fresh(self):
        widget = MagicMock()
        widget.enabled = True
        widget.cached_at = now() - timedelta(seconds=10)
        widget.widget_type = "lastfm"  # TTL = 60s
        assert needs_refresh(widget) is False


class TestGetConfigSchema:
    def test_returns_all_types(self):
        schema = get_config_schema()
        assert "lastfm" in schema
        assert "weather" in schema
        assert "steam" in schema

    def test_lastfm_has_username_field(self):
        schema = get_config_schema()
        fields = schema["lastfm"]
        assert any(f["key"] == "username" for f in fields)


class TestValidateWidgetConfig:
    def test_lastfm_valid(self):
        api_response = {"recenttracks": {"track": [{"name": "Song"}]}}
        with (
            patch("app.services.widget_service.LASTFM_API_KEY", "test_key"),
            patch("urllib.request.urlopen", return_value=_mock_urlopen(api_response)),
        ):
            result = validate_widget_config("lastfm", {"username": "testuser"})
        assert result is None  # valid

    def test_lastfm_user_not_found(self):
        api_response = {"error": 6, "message": "User not found"}
        with (
            patch("app.services.widget_service.LASTFM_API_KEY", "test_key"),
            patch("urllib.request.urlopen", return_value=_mock_urlopen(api_response)),
        ):
            result = validate_widget_config("lastfm", {"username": "nonexistent"})
        assert result == "User not found"

    def test_lastfm_missing_key(self):
        with patch("app.services.widget_service.LASTFM_API_KEY", ""):
            result = validate_widget_config("lastfm", {"username": "testuser"})
        assert result == "Last.fm API key not configured"

    def test_lastfm_empty_username(self):
        result = validate_widget_config("lastfm", {"username": ""})
        assert result == "Username is required"

    def test_lastfm_network_error(self):
        with (
            patch("app.services.widget_service.LASTFM_API_KEY", "test_key"),
            patch("urllib.request.urlopen", side_effect=urllib.error.URLError("timeout")),
        ):
            result = validate_widget_config("lastfm", {"username": "testuser"})
        assert result == "Could not reach Last.fm API"

    def test_weather_valid(self):
        api_response = {
            "current_condition": [{"temp_C": "22", "weatherDesc": [{"value": "Sunny"}]}]
        }
        with patch("urllib.request.urlopen", return_value=_mock_urlopen(api_response)):
            result = validate_widget_config("weather", {"city": "London"})
        assert result is None

    def test_weather_city_not_found(self):
        api_response = {"current_condition": []}
        with patch("urllib.request.urlopen", return_value=_mock_urlopen(api_response)):
            result = validate_widget_config("weather", {"city": "NonexistentCity123"})
        assert result == "City not found"

    def test_weather_empty_city(self):
        result = validate_widget_config("weather", {"city": ""})
        assert result == "City is required"

    def test_weather_network_error(self):
        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("timeout")):
            result = validate_widget_config("weather", {"city": "London"})
        assert result == "Could not reach weather service"

    def test_steam_valid(self):
        api_response = {"response": {"players": [{"personaname": "gamer"}]}}
        with (
            patch("app.services.widget_service.STEAM_API_KEY", "test_key"),
            patch("urllib.request.urlopen", return_value=_mock_urlopen(api_response)),
        ):
            result = validate_widget_config("steam", {"steam_id": "7656119"})
        assert result is None

    def test_steam_not_found(self):
        api_response = {"response": {"players": []}}
        with (
            patch("app.services.widget_service.STEAM_API_KEY", "test_key"),
            patch("urllib.request.urlopen", return_value=_mock_urlopen(api_response)),
        ):
            result = validate_widget_config("steam", {"steam_id": "0000000"})
        assert result == "Steam ID not found"

    def test_steam_missing_key(self):
        with patch("app.services.widget_service.STEAM_API_KEY", ""):
            result = validate_widget_config("steam", {"steam_id": "7656119"})
        assert result == "Steam API key not configured"

    def test_steam_empty_id(self):
        result = validate_widget_config("steam", {"steam_id": ""})
        assert result == "Steam ID is required"

    def test_unknown_type(self):
        result = validate_widget_config("invalid", {})
        assert result == "Unknown widget type: invalid"
