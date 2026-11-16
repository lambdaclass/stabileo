defmodule StabileoRepo.Repo.Migrations.AddMarketingAndAdReportingIndexes do
  use Ecto.Migration

  @disable_ddl_transaction true
  @disable_migration_lock true

  def change do
    create unique_index(:signup_sources, [:account_id], concurrently: true)
    create index(:signup_sources, [:inserted_at], concurrently: true)
    create unique_index(:account_milestones, [:account_id, :kind], concurrently: true)
    create index(:account_milestones, [:kind, :occurred_at], concurrently: true)
    create unique_index(:account_active_days, [:account_id, :day], concurrently: true)
  end
end
