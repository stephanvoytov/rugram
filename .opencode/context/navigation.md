# Rugram Project Context

**Global context**: `C:\Users\stepa\.opencode\context\` — universal standards & workflows.
**Project context**: `.opencode/context/` — this directory, project-specific overrides.

## Quick Reference

| Task | File |
|------|------|
| **Architecture/ Conventions** | `AGENTS.md` (project root) |
| **Code quality** | Global: `core/standards/code-quality.md` |
| **Tests** | Global: `core/standards/test-coverage.md` |
| **Service layer** | `app/services/*.py` |

## Project Facts (cached for speed)

- **Entry**: `app.create_app()` (factory), wrapped by `wsgi.py`
- **Stack**: Flask + SQLAlchemy 2.0 + SQLite + Bootstrap 5.3 (Catppuccin)
- **Auth**: flask-login, WTForms (CSRF enabled globally, disabled in tests)
- **DB**: In-memory SQLite in tests (`conftest.py`), file-based for dev (`instance/app.sqlite`)
- **Tests**: 246 Python (119 unit + 103 integration + 24 security) + 319 JS terminal — all green
- **Services**: 7 classes in `app/services/` — PostService, FeedService, ChatService, NotificationService, SocialService, AdminService, AuthService
- **API**: All endpoints under `/api/v1/*` (Flask-RESTful, auth, feed, notifications, followers, etc.), Swagger UI at `/apidocs/`
- **Cache**: Optional Redis via `app/cache.py` (no REDIS_URL → no-op). Feed cached 30s with version-based invalidation.
- **Terminal**: Custom `<textarea>`-based terminal emulator (9 JS files, loaded in strict order)
- **Encryption**: Fernet (MultiFernet) for chat messages via `app/crypto.py`
- **Push**: Web Push via `app/push.py` (VAPID optional, silently disabled if not configured)
