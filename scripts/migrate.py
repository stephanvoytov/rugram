#!/usr/bin/env python3
"""Resilient migration runner — applies Alembic migrations one by one.

SQLite auto-commits every ALTER TABLE (no transactional DDL). If a migration
fails midway (deploy crash, container restart), some columns exist but the
version isn't recorded in alembic_version. On retry → duplicate column → crash.

This script catches that: if a migration fails with "duplicate" / "already exists",
it notes the column already existed, marks the migration as applied, and continues.

Usage:
    python scripts/migrate.py          # Apply pending migrations
    python scripts/migrate.py --check  # CI mode — fail if migrations pending
"""

import os
import sys
import argparse

from alembic.config import Config
from alembic.command import upgrade
from alembic.script import ScriptDirectory
from alembic.runtime.migration import MigrationContext
from alembic.util.exc import CommandError
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError


def get_current_revision(engine):
    """Read current alembic_version from DB. Returns None if not yet applied."""
    try:
        with engine.connect() as conn:
            context = MigrationContext.configure(conn)
            return context.get_current_revision()
    except Exception:
        return None


def get_next_revision(script, current_rev):
    """Find the revision immediately after current_rev in the chain."""
    for rev in script.walk_revisions():  # yields head → base
        if rev.down_revision == current_rev:
            return rev.revision
    return None


def get_pending_revisions(script, current_rev, head):
    """Return list of revision IDs from current+1 to head, in order."""
    if current_rev == head:
        return []
    if current_rev is None:
        return [head]

    pending = []
    rev = head
    while rev and rev != current_rev:
        pending.insert(0, rev)
        r = script.get_revision(rev)
        rev = r.down_revision if r else None
    return pending


def main():
    parser = argparse.ArgumentParser(description='Apply Alembic migrations resiliently.')
    parser.add_argument('--check', action='store_true',
                        help='CI mode: exit 1 if migrations would be applied')
    args = parser.parse_args()

    # Always run from project root
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    # Create Flask app to get real DB URL from config
    from app import create_app
    app = create_app()

    db_uri = app.config['SQLALCHEMY_DATABASE_URI']
    db_path = db_uri.replace('sqlite:///', '')

    # Configure Alembic with the real DB URL
    alembic_cfg = Config('alembic.ini')
    alembic_cfg.set_main_option('sqlalchemy.url', db_uri)

    script = ScriptDirectory.from_config(alembic_cfg)
    head = script.get_current_head()

    engine = create_engine(db_uri)
    current_rev = get_current_revision(engine)

    if current_rev == head:
        print('[ok] All migrations already applied.')
        engine.dispose()
        return 0

    pending = get_pending_revisions(script, current_rev, head)

    if args.check:
        print(f'[check] Would apply {len(pending)} migration(s):')
        for rev_id in pending:
            r = script.get_revision(rev_id)
            print(f'    {rev_id}  {r.doc}')
        engine.dispose()
        return 1  # CI failure: migrations aren't up to date

    # ── Apply one revision at a time ──
    applied = 0
    skipped = 0

    # Refresh current_rev in case it changed during --check
    current_rev = get_current_revision(engine)

    while current_rev != head:
        try:
            upgrade(alembic_cfg, '+1')
            applied += 1
            current_rev = get_current_revision(engine)
            r = script.get_revision(current_rev) if current_rev else None
            label = f'  [ok] {current_rev}' + (f'  {r.doc}' if r else '')
            print(label)

        except OperationalError as e:
            err_str = str(e).lower()
            if 'duplicate' in err_str or 'already exists' in err_str:
                # Column/table already existed — skip this migration
                next_rev = get_next_revision(script, current_rev)
                if next_rev:
                    with engine.connect() as conn:
                        # alembic_version has no UNIQUE — DELETE + INSERT to avoid duplicates
                        conn.execute(text("DELETE FROM alembic_version"))
                        conn.execute(
                            text("INSERT INTO alembic_version (version_num) VALUES (:rev)"),
                            {"rev": next_rev}
                        )
                        conn.commit()
                    skipped += 1
                    r = script.get_revision(next_rev)
                    label = f'  ~ {next_rev}' + (f'  {r.doc} (already applied)' if r else ' (already applied)')
                    print(label)
                    current_rev = get_current_revision(engine)
                else:
                    print(f'[err] Cannot determine next revision from {current_rev}')
                    engine.dispose()
                    return 1
            else:
                print(f'[err] Migration failed:\n{e}')
                engine.dispose()
                return 1

        except CommandError as e:
            err = str(e)
            if 'Can\'t locate revision' in err or 'No such revision' in err:
                print('[ok] No more migrations to apply (at head).')
                break
            print(f'[err] Alembic error:\n{e}')
            engine.dispose()
            return 1

        except Exception as e:
            print(f'[err] Unexpected error:\n{e}')
            engine.dispose()
            return 1

    print(f'[ok] Done: {applied} applied, {skipped} skipped')
    engine.dispose()
    return 0


if __name__ == '__main__':
    sys.exit(main())
