"""add tags and post_tags tables

Revision ID: c921e7cf823f
Revises: ea26efb595b5
Create Date: 2026-06-05 11:00:43.764325

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c921e7cf823f'
down_revision: Union[str, Sequence[str], None] = 'ea26efb595b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create tags and post_tags tables."""
    op.create_table(
        'tags',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('post_count', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_tags_name'), 'tags', ['name'], unique=True)

    op.create_table(
        'post_tags',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('post_id', sa.Integer(), nullable=False),
        sa.Column('tag_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('post_id', 'tag_id', name='uq_post_tag'),
    )
    op.create_index('ix_post_tags_tag_id', 'post_tags', ['tag_id'])
    op.create_index('ix_post_tags_post_id', 'post_tags', ['post_id'])


def downgrade() -> None:
    """Drop tags and post_tags tables."""
    op.drop_index('ix_post_tags_post_id', table_name='post_tags')
    op.drop_index('ix_post_tags_tag_id', table_name='post_tags')
    op.drop_table('post_tags')
    op.drop_index('ix_tags_name', table_name='tags')
    op.drop_table('tags')
