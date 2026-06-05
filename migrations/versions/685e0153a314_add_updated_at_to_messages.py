"""add updated_at to messages

Revision ID: 685e0153a314
Revises: 019c9655ef78
Create Date: 2026-06-06 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '685e0153a314'
down_revision: Union[str, Sequence[str], None] = '019c9655ef78'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    """Check if a column exists in the table (SQLite)."""
    conn = op.get_bind()
    rows = conn.execute(sa.text(f'PRAGMA table_info({table})')).fetchall()
    return any(row[1] == column for row in rows)


def upgrade() -> None:
    """Add updated_at column to messages table (idempotent)."""
    if not _column_exists('messages', 'updated_at'):
        op.add_column('messages', sa.Column('updated_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('messages', 'updated_at')
