"""Add candidate_profiles.location_id foreign key to locations.

Revision ID: 0005_candidate_location_fk
Revises: 0004_locations
Create Date: 2025-12-23
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0005_candidate_location_fk"
down_revision = "0004_locations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("candidate_profiles", sa.Column("location_id", sa.String(length=32), nullable=True))
    op.create_foreign_key(
        "fk_candidate_profiles_location",
        "candidate_profiles",
        "locations",
        ["location_id"],
        ["id"],
    )
    op.create_index("ix_candidate_profiles_location_id", "candidate_profiles", ["location_id"])


def downgrade() -> None:
    op.drop_index("ix_candidate_profiles_location_id", table_name="candidate_profiles")
    op.drop_constraint("fk_candidate_profiles_location", "candidate_profiles", type_="foreignkey")
    op.drop_column("candidate_profiles", "location_id")
