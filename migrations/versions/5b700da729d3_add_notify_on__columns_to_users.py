"""add notify_on_* columns to users

Revision ID: 5b700da729d3
Revises: 685e0153a314
Create Date: 2026-06-06 00:45:14.181277

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5b700da729d3'
down_revision: Union[str, Sequence[str], None] = '685e0153a314'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for col in ('notify_on_like', 'notify_on_comment', 'notify_on_follow', 'notify_on_message'):
        op.add_column('users', sa.Column(col, sa.Boolean(), nullable=True))
        op.execute(f'UPDATE users SET {col} = 1 WHERE {col} IS NULL')
        with op.batch_alter_table('users') as batch_op:
            batch_op.alter_column(col, nullable=False)


def downgrade() -> None:
    for col in ('notify_on_like', 'notify_on_comment', 'notify_on_follow', 'notify_on_message'):
        op.drop_column('users', col)
