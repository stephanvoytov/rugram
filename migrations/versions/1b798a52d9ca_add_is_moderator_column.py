"""add_is_moderator_column

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


def upgrade() -> None:
    # op.add_column на SQLite НЕ требует batch-режима —
    # использует нативный ALTER TABLE ADD COLUMN, без временных таблиц.
    op.add_column('users', sa.Column('is_moderator', sa.Boolean(),
                                     nullable=False, server_default=sa.text('0')))


def downgrade() -> None:
    # DROP COLUMN требует batch на старых SQLite (< 3.35)
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('is_moderator')
