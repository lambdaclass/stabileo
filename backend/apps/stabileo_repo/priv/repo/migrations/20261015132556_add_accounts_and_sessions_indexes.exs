defmodule StabileoRepo.Repo.Migrations.AddAccountsAndSessionsIndexes do
  use Ecto.Migration

  @disable_ddl_transaction true
  @disable_migration_lock true

  def change do
    create unique_index(:accounts, [:email], concurrently: true)

    create index(:sessions, [:account_id], concurrently: true)
    create index(:sessions, [:expires_at], concurrently: true)
  end
end
