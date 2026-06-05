#!/bin/sh
set -e

echo "==> Ensuring upload directories exist..."
mkdir -p /app/app/static/uploads/posts /app/app/static/uploads/profile_images

echo "==> Cleaning stale Alembic temp tables..."
DB="instance/app.sqlite"
if [ -f "$DB" ]; then
    sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_alembic_tmp_%';" | \
    while read -r tbl; do
        sqlite3 "$DB" "DROP TABLE IF EXISTS \"$tbl\";"
        echo "    dropped $tbl"
    done
fi

echo "==> Running migrations..."
alembic upgrade head

echo "==> Starting gunicorn..."
exec gunicorn -w 4 --preload -b 0.0.0.0:8000 wsgi:app
