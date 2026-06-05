"""add edited_at to messages

Revision ID: 019c9655ef78
Revises: 52979a6732a3
Create Date: 2026-06-05 23:17:50.973472

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '019c9655ef78'
down_revision: Union[str, Sequence[str], None] = '52979a6732a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    """Check if a column exists in the table (SQLite)."""
    conn = op.get_bind()
    rows = conn.execute(sa.text(f'PRAGMA table_info({table})')).fetchall()
    return any(row[1] == column for row in rows)


def upgrade() -> None:
    """Add edited_at column to messages table (idempotent)."""
    if not _column_exists('messages', 'edited_at'):
        op.add_column('messages', sa.Column('edited_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('messages', 'edited_at')
