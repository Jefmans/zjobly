"""Add detailed_signals to candidate profiles.

Revision ID: 0012_candidate_detailed_signals
Revises: 0011_auth_sessions
Create Date: 2026-04-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0012_candidate_detailed_signals"
down_revision = "0011_auth_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("candidate_profiles", sa.Column("detailed_signals", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("candidate_profiles", "detailed_signals")

