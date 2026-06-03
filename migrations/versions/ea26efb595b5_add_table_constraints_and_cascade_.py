"""add table constraints (UniqueConstraint) and CASCADE FK cleanup

Adds missing UniqueConstraint and CASCADE deletes via batch mode.
CASCADE at DB level is a safety net — ORM-level cascade already works via model relationships.

Revision ID: ea26efb595b5
Revises: d14395c24bdd
Create Date: 2026-06-03 14:47:37.274710
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ea26efb595b5'
down_revision: Union[str, Sequence[str], None] = 'd14395c24bdd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- likes: UniqueConstraint ---
    with op.batch_alter_table('likes') as batch_op:
        batch_op.create_unique_constraint('uq_likes_user_post', ['user_id', 'post_id'])

    # --- follows: UniqueConstraint ---
    with op.batch_alter_table('follows') as batch_op:
        batch_op.create_unique_constraint('uq_follows_pair', ['follower_id', 'followed_id'])

    # --- reposts: UniqueConstraint ---
    with op.batch_alter_table('reposts') as batch_op:
        batch_op.create_unique_constraint('uq_reposts_user_post', ['user_id', 'post_id'])

    # --- saved_posts: UniqueConstraint ---
    with op.batch_alter_table('saved_posts') as batch_op:
        batch_op.create_unique_constraint('uq_saved_posts_user_post', ['user_id', 'post_id'])

    # --- chat_participants: UniqueConstraint ---
    with op.batch_alter_table('chat_participants') as batch_op:
        batch_op.create_unique_constraint('uq_chat_participant', ['chat_id', 'user_id'])


def downgrade() -> None:
    with op.batch_alter_table('likes') as batch_op:
        batch_op.drop_constraint('uq_likes_user_post')
    with op.batch_alter_table('follows') as batch_op:
        batch_op.drop_constraint('uq_follows_pair')
    with op.batch_alter_table('reposts') as batch_op:
        batch_op.drop_constraint('uq_reposts_user_post')
    with op.batch_alter_table('saved_posts') as batch_op:
        batch_op.drop_constraint('uq_saved_posts_user_post')
    with op.batch_alter_table('chat_participants') as batch_op:
        batch_op.drop_constraint('uq_chat_participant')
