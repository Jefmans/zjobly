"""Add video_object_key to jobs for playback."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
# Keep revision id <= 32 chars because alembic_version.version_num is VARCHAR(32)
revision = "0003_video_object_key"
down_revision = "0002_jobs_user_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column("video_object_key", sa.String(length=512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("jobs", "video_object_key")
