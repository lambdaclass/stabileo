defmodule StabileoRepo.Repo.Migrations.CreateSystemSettingsAndAdminAllowedEmails do
  use Ecto.Migration

  def change do
    create table(:system_settings) do
      add :key, :string, null: false
      add :value, :map, null: false, default: %{}
      add :description, :string

      timestamps(type: :utc_datetime)
    end

    create table(:admin_allowed_emails) do
      add :email, :string, null: false
      add :is_active, :boolean, null: false, default: true
      add :added_by_id, references(:accounts, on_delete: :nilify_all)

      timestamps(type: :utc_datetime)
    end
  end
end
