defmodule StabileoRepo.Repo.Migrations.AddAssignmentsAndAttemptsIndexes do
  use Ecto.Migration

  @disable_ddl_transaction true
  @disable_migration_lock true

  def change do
    create unique_index(:assignments, [:code], concurrently: true)
    create index(:assignments, [:account_id, :inserted_at], concurrently: true)

    create unique_index(:assignment_attempts, [:assignment_id, :account_id], concurrently: true)

    create index(:assignment_attempts, [:account_id], concurrently: true)
  end
end
