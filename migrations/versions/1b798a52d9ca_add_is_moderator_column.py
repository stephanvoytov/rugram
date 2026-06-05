"""add is_admin and is_moderator columns to users

Revision ID: 1b798a52d9ca
Revises: c921e7cf823f
Create Date: 2026-06-05 20:04:54.240569

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1b798a52d9ca'
down_revision: Union[str, Sequence[str], None] = 'c921e7cf823f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    """Check if a column exists in the table (SQLite)."""
    conn = op.get_bind()
    rows = conn.execute(sa.text(f'PRAGMA table_info({table})')).fetchall()
    return any(row[1] == column for row in rows)


def upgrade() -> None:
    # is_admin was missing from migrations — add it if not present
    if not _column_exists('users', 'is_admin'):
        op.add_column('users', sa.Column('is_admin', sa.Boolean(),
                                         nullable=False, server_default=sa.text('0')))
    # is_moderator — new column
    if not _column_exists('users', 'is_moderator'):
        op.add_column('users', sa.Column('is_moderator', sa.Boolean(),
                                         nullable=False, server_default=sa.text('0')))


def downgrade() -> None:
    # DROP COLUMN требует batch на старых SQLite (< 3.35)
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('is_moderator')
        if _column_exists('users', 'is_admin'):
            batch_op.drop_column('is_admin')
