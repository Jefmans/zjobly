"""Add video_object_key to applications.

Revision ID: 0006_application_video_key
Revises: 0005_candidate_location_fk
Create Date: 2025-12-23
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0006_application_video_key"
down_revision = "0005_candidate_location_fk"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("applications", sa.Column("video_object_key", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("applications", "video_object_key")
