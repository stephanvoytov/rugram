#!/usr/bin/env python3
"""One-time fix: add columns that were skipped by migrate.py's "already applied" logic.

When alembic_version was set but a migration only partially applied (SQLite DDL
auto-commit), subsequent runs skip it. This script adds any missing columns manually.

Usage:
    python scripts/fix_missing_columns.py

Safe to re-run — checks PRAGMA table_info before each ALTER TABLE.
"""

import os
import sys

# Add project root so we can import config
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import create_engine, text


def table_exists(conn, table):
    rows = conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"),
        {'name': table},
    ).fetchall()
    return bool(rows)


def column_exists(conn, table, column):
    if not table_exists(conn, table):
        return False
    rows = conn.execute(text(f'PRAGMA table_info({table})')).fetchall()
    return any(row[1] == column for row in rows)


def add_column(conn, table, column, col_type, default=None, not_null=False):
    sql = f'ALTER TABLE {table} ADD COLUMN {column} {col_type}'
    if default is not None:
        sql += f' DEFAULT {default}'
    if not_null:
        sql += ' NOT NULL'
    conn.execute(text(sql))
    print(f'  [+] Added {table}.{column}')


def main():
    db_url = os.environ.get(
        'DATABASE_URL',
        f'sqlite:///{os.path.join(os.path.dirname(__file__), "..", "instance", "app.sqlite")}',
    )
    engine = create_engine(db_url)

    with engine.connect() as conn:
        # Use autocommit for DDL (SQLite auto-commits ALTER TABLE anyway)
        conn.execution_options(isolation_level='AUTOCOMMIT')

        # ae0cd75ad702 — notifications_enabled
        if not column_exists(conn, 'users', 'notifications_enabled'):
            add_column(conn, 'users', 'notifications_enabled', 'BOOLEAN', default=1, not_null=True)

        # d14395c24bdd — text on notifications
        if table_exists(conn, 'notifications') and not column_exists(conn, 'notifications', 'text'):
            add_column(conn, 'notifications', 'text', 'VARCHAR')

        # 5b700da729d3 — notify_on_* columns
        for col in ('notify_on_like', 'notify_on_comment', 'notify_on_follow', 'notify_on_message'):
            if not column_exists(conn, 'users', col):
                add_column(conn, 'users', col, 'BOOLEAN', default=1, not_null=True)

    print('[ok] All missing columns added.')


if __name__ == '__main__':
    main()
