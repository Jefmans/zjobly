"""Add video_object_key to jobs for playback."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0003_add_video_object_key_to_jobs"
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
