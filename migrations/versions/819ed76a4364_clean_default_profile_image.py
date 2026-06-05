"""clean_default_profile_image

Remove stale 'default_profile_image.jpg' values set by old migration
server_default, replace with NULL so the real default-profile.png is used.

Revision ID: 819ed76a4364
Revises: 1b798a52d9ca
Create Date: 2026-06-05 20:46:02.838413

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '819ed76a4364'
down_revision: Union[str, Sequence[str], None] = '1b798a52d9ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Replace bogus default_profile_image.jpg with NULL so templates
    # correctly fall back to static/default-profile.png
    op.execute(
        "UPDATE users SET profile_image = NULL "
        "WHERE profile_image = 'default_profile_image.jpg'"
    )


def downgrade() -> None:
    # Restore original values (for rollback)
    pass
