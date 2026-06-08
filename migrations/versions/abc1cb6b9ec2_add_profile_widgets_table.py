"""add profile_widgets table

Revision ID: abc1cb6b9ec2
Revises: 5b700da729d3
Create Date: 2026-06-08 21:23:43.641708

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "abc1cb6b9ec2"
down_revision: Union[str, Sequence[str], None] = "5b700da729d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table: str) -> bool:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"),
        {"name": table},
    ).fetchall()
    return len(rows) > 0


def upgrade() -> None:
    # idempotent: skip if table already exists (db.create_all may have created it)
    if _table_exists("profile_widgets"):
        return

    op.create_table(
        "profile_widgets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("widget_type", sa.String(), nullable=False),
        sa.Column("config", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("cached_data", sa.Text(), nullable=True),
        sa.Column("cached_at", sa.DateTime(), nullable=True),
        sa.Column("created_date", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_profile_widgets_user_id", "profile_widgets", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_profile_widgets_user_id", table_name="profile_widgets")
    op.drop_table("profile_widgets")
