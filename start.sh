#!/bin/sh
set -e

echo "==> Checking SECRET_KEY..."
if [ -z "$SECRET_KEY" ]; then
    echo "FATAL: SECRET_KEY is not set. Create a .env file with SECRET_KEY=..."
    exit 1
fi

echo "==> Ensuring upload directories exist..."
mkdir -p /app/app/static/uploads/posts /app/app/static/uploads/profile_images /app/instance/uploads/chat

echo "==> Cleaning stale Alembic temp tables..."
python3 -c "
import sqlite3, os
db = 'instance/app.sqlite'
if os.path.exists(db):
    conn = sqlite3.connect(db)
    rows = conn.execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_alembic_tmp_%'\").fetchall()
    for row in rows:
        conn.execute(f'DROP TABLE IF EXISTS \"{row[0]}\"')
        print(f'    dropped {row[0]}')
    conn.commit()
    conn.close()
"

echo "==> Running migrations..."
alembic upgrade head

echo "==> Starting gunicorn..."
exec gunicorn -w 4 --preload -b 0.0.0.0:8000 wsgi:app
