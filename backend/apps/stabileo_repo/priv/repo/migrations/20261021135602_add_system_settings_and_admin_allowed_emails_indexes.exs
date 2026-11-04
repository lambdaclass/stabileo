defmodule StabileoRepo.Repo.Migrations.AddSystemSettingsAndAdminAllowedEmailsIndexes do
  use Ecto.Migration

  @disable_ddl_transaction true
  @disable_migration_lock true

  def change do
    create unique_index(:system_settings, [:key], concurrently: true)
    create unique_index(:admin_allowed_emails, [:email], concurrently: true)
    create index(:admin_allowed_emails, [:added_by_id], concurrently: true)
  end
end
