defmodule StabileoRepo.Repo.Migrations.AddAccountsGoogleSubjectIndex do
  use Ecto.Migration

  @disable_ddl_transaction true
  @disable_migration_lock true

  def change do
    create unique_index(:accounts, [:google_subject], concurrently: true)
  end
end
