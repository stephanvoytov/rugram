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


def upgrade() -> None:
    """Add image column to messages table."""
    op.add_column('messages', sa.Column('image', sa.String(), nullable=True))
    op.alter_column('messages', 'text',
                    existing_type=sa.String(),
                    nullable=True)  # text became nullable in this migration


def downgrade() -> None:
    """Remove image column from messages table."""
    op.alter_column('messages', 'text',
                    existing_type=sa.String(),
                    nullable=False)
    op.drop_column('messages', 'image')
