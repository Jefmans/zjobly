"""Add candidate profile video and keywords.

Revision ID: 0008_candidate_profile_video_keywords
Revises: 0007_job_keywords
Create Date: 2026-01-05
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0008_candidate_profile_video_keywords"
down_revision = "0007_job_keywords"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("candidate_profiles", sa.Column("video_object_key", sa.String(length=255), nullable=True))
    op.add_column("candidate_profiles", sa.Column("keywords", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("candidate_profiles", "keywords")
    op.drop_column("candidate_profiles", "video_object_key")
