defmodule StabileoRepo.Repo.Migrations.AddConsentRevisions do
  use Ecto.Migration

  def up do
    execute("CREATE SEQUENCE consent_revisions")

    alter table(:consents) do
      add :revision, :bigint, null: false, default: fragment("nextval('consent_revisions')")
    end

    flush()

    execute("ALTER SEQUENCE consent_revisions OWNED BY consents.revision")

    execute("""
    WITH ordered AS (
      SELECT id, row_number() OVER (ORDER BY inserted_at, granted DESC, id) AS revision
      FROM consents
    )
    UPDATE consents SET revision = ordered.revision FROM ordered WHERE consents.id = ordered.id
    """)

    execute("""
    SELECT setval(pg_get_serial_sequence('consents', 'revision'),
      GREATEST(COALESCE((SELECT MAX(revision) FROM consents), 0), 1),
      EXISTS(SELECT 1 FROM consents))
    """)
  end

  def down do
    alter table(:consents) do
      remove_if_exists :revision
    end
  end
end
