"""add push_subscriptions table

Revision ID: 0c1b1665909a
Revises: 0001
Create Date: 2026-06-02 00:10:49.046957

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0c1b1665909a'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema — add push_subscriptions table only."""
    op.create_table('push_subscriptions',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('user_id', sa.Integer(), nullable=False, index=True),
        sa.Column('endpoint', sa.Text(), nullable=False),
        sa.Column('p256dh_key', sa.String(length=256), nullable=False),
        sa.Column('auth_key', sa.String(length=64), nullable=False),
        sa.Column('created_date', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    """Downgrade schema — drop push_subscriptions table."""
    op.drop_table('push_subscriptions')
