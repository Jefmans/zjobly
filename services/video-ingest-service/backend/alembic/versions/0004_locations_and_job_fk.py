"""add locations table and job location fk

Revision ID: 0004_locations
Revises: 0003_add_video_object_key_to_jobs
Create Date: 2025-12-21
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0004_locations"
down_revision = "0003_add_video_object_key_to_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "locations",
        sa.Column("id", sa.String(length=32), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("city", sa.String(length=255), nullable=True),
        sa.Column("region", sa.String(length=255), nullable=True),
        sa.Column("country", sa.String(length=255), nullable=True),
        sa.Column("postal_code", sa.String(length=32), nullable=True),
        sa.Column("latitude", sa.String(length=64), nullable=True),
        sa.Column("longitude", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_locations_name", "locations", ["name"])
    op.create_index("ix_locations_city", "locations", ["city"])
    op.create_index("ix_locations_region", "locations", ["region"])
    op.create_index("ix_locations_country", "locations", ["country"])
    op.create_index("ix_locations_postal_code", "locations", ["postal_code"])
    op.add_column("jobs", sa.Column("location_id", sa.String(length=32), nullable=True))
    op.create_foreign_key("fk_jobs_location", "jobs", "locations", ["location_id"], ["id"])
    op.create_index("ix_jobs_location_id", "jobs", ["location_id"])


def downgrade() -> None:
    op.drop_index("ix_jobs_location_id", table_name="jobs")
    op.drop_constraint("fk_jobs_location", "jobs", type_="foreignkey")
    op.drop_column("jobs", "location_id")
    op.drop_index("ix_locations_postal_code", table_name="locations")
    op.drop_index("ix_locations_country", table_name="locations")
    op.drop_index("ix_locations_region", table_name="locations")
    op.drop_index("ix_locations_city", table_name="locations")
    op.drop_index("ix_locations_name", table_name="locations")
    op.drop_table("locations")
