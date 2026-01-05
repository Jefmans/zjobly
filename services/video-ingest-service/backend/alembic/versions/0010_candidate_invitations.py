"""Add candidate invitations.

Revision ID: 0010_candidate_invitations
Revises: 0009_candidate_favorites
Create Date: 2026-01-06
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0010_candidate_invitations"
down_revision = "0009_candidate_favorites"
branch_labels = None
depends_on = None


def upgrade() -> None:
    invitation_status = sa.Enum("pending", "accepted", "rejected", name="invitationstatus")
    op.create_table(
        "candidate_invitations",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("company_id", sa.String(length=32), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column(
            "candidate_id",
            sa.String(length=32),
            sa.ForeignKey("candidate_profiles.id"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "invited_by_user_id",
            sa.String(length=32),
            sa.ForeignKey("users.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("status", invitation_status, nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "company_id",
            "candidate_id",
            name="uq_candidate_invitation_company_candidate",
        ),
    )


def downgrade() -> None:
    op.drop_table("candidate_invitations")
    op.execute("DROP TYPE IF EXISTS invitationstatus")
