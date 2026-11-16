defmodule StabileoRepo.Repo.Migrations.AddConsentsProjectsInsightsAndAdminActionsIndexes do
  use Ecto.Migration

  @disable_ddl_transaction true
  @disable_migration_lock true

  def change do
    create index(:consents, [:account_id, :kind, :inserted_at], concurrently: true)
    create index(:projects, [:account_id, :updated_at], concurrently: true)
    create index(:usage_events, [:occurred_at], concurrently: true)
    create index(:usage_events, [:name, :occurred_at], concurrently: true)
    create index(:feedback, [:status, :inserted_at], concurrently: true)
    create index(:feedback, [:account_id], concurrently: true)
    create index(:admin_actions, [:inserted_at], concurrently: true)
    create index(:admin_actions, [:admin_id], concurrently: true)
  end
end
