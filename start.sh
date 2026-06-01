#!/bin/sh
set -e

echo "==> Ensuring upload directories exist..."
mkdir -p /app/app/static/uploads/posts /app/app/static/uploads/profile_images

echo "==> Running migrations..."
alembic upgrade head

echo "==> Starting gunicorn..."
exec gunicorn -w 4 --preload -b 0.0.0.0:8000 wsgi:app
