#!/bin/sh
set -e

echo "==> Running migrations..."
alembic upgrade head

echo "==> Starting gunicorn..."
exec gunicorn -w 4 --preload -b 0.0.0.0:8000 wsgi:app
