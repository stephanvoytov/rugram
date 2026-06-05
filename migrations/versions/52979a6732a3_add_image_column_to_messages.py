"""add image column to messages

Revision ID: 52979a6732a3
Revises: 819ed76a4364
Create Date: 2026-06-05 22:23:19.311913

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '52979a6732a3'
down_revision: Union[str, Sequence[str], None] = '819ed76a4364'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    """Check if a column exists in the table (SQLite)."""
    conn = op.get_bind()
    rows = conn.execute(sa.text(f'PRAGMA table_info({table})')).fetchall()
    return any(row[1] == column for row in rows)


def upgrade() -> None:
    """Add image column to messages table (idempotent)."""
    if not _column_exists('messages', 'image'):
        op.add_column('messages', sa.Column('image', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('messages', 'image')
