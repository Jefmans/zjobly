"""Add keywords to jobs.

Revision ID: 0007_job_keywords
Revises: 0006_application_video_key
Create Date: 2025-12-24
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0007_job_keywords"
down_revision = "0006_application_video_key"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("keywords", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("jobs", "keywords")
