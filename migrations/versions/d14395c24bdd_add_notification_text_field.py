"""add notification text field

Revision ID: d14395c24bdd
Revises: ae0cd75ad702
Create Date: 2026-06-03 13:38:30.219796

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd14395c24bdd'
down_revision: Union[str, Sequence[str], None] = 'ae0cd75ad702'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    """Check if a column exists in the table (SQLite)."""
    conn = op.get_bind()
    rows = conn.execute(sa.text(f'PRAGMA table_info({table})')).fetchall()
    return any(row[1] == column for row in rows)


def upgrade() -> None:
    """Add text column to notifications (idempotent)."""
    if not _column_exists('notifications', 'text'):
        op.add_column('notifications', sa.Column('text', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('notifications', 'text')
