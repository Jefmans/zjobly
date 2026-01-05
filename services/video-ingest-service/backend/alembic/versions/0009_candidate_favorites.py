"""Add candidate favorites.

Revision ID: 0009_candidate_favorites
Revises: 0008_candidate_profile_media
Create Date: 2026-01-06
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0009_candidate_favorites"
down_revision = "0008_candidate_profile_media"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "candidate_favorites",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("user_id", sa.String(length=32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("company_id", sa.String(length=32), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column(
            "candidate_id",
            sa.String(length=32),
            sa.ForeignKey("candidate_profiles.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "user_id",
            "company_id",
            "candidate_id",
            name="uq_candidate_favorite_user_company_candidate",
        ),
    )


def downgrade() -> None:
    op.drop_table("candidate_favorites")
