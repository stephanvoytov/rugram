"""add notifications_enabled to users

Revision ID: ae0cd75ad702
Revises: 0c1b1665909a
Create Date: 2026-06-01 22:33:58.001271

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ae0cd75ad702'
down_revision: Union[str, Sequence[str], None] = '0c1b1665909a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('notifications_enabled', sa.Boolean(), nullable=True))
    op.execute('UPDATE users SET notifications_enabled = 1 WHERE notifications_enabled IS NULL')
    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column('notifications_enabled', nullable=False)


def downgrade() -> None:
    op.drop_column('users', 'notifications_enabled')
