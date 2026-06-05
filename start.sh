#!/bin/sh
set -e

echo "==> Ensuring upload directories exist..."
mkdir -p /app/app/static/uploads/posts /app/app/static/uploads/profile_images

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

echo "==> Verifying schema..."
python3 -c "
import sqlite3, os, sys
db = 'instance/app.sqlite'
if os.path.exists(db):
    conn = sqlite3.connect(db)
    cols = [row[1] for row in conn.execute('PRAGMA table_info(users)').fetchall()]
    missing = []
    for col in ['is_admin', 'is_moderator']:
        if col not in cols:
            missing.append(col)
    if missing:
        print(f'ERROR: missing columns in users: {missing}')
        print('Adding them manually...')
        for col in missing:
            conn.execute(f'ALTER TABLE users ADD COLUMN {col} BOOLEAN NOT NULL DEFAULT 0')
            print(f'    added {col}')
        conn.commit()
        # Stamp the migration so alembic is happy
        import subprocess
        subprocess.run(['alembic', 'stamp', '1b798a52d9ca'], check=True)
        print('Migration stamped.')
    conn.close()
    print('Schema OK')
"

echo "==> Starting gunicorn..."
exec gunicorn -w 4 --preload -b 0.0.0.0:8000 wsgi:app
