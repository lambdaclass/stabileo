defmodule StabileoRepo.Repo.Migrations.CreateAccounts do
  use Ecto.Migration

  def change do
    create table(:accounts) do
      add :email, :string, null: false
      add :password_hash, :string
      add :name, :string, null: false
      add :company, :string
      add :job_title, :string
      add :country, :string, size: 2
      add :locale, :string, size: 8, null: false, default: "es"
      add :email_verified_at, :utc_datetime
      add :last_sign_in_at, :utc_datetime
      add :is_active, :boolean, null: false, default: true

      timestamps(type: :utc_datetime)
    end

    create table(:sessions) do
      add :account_id, references(:accounts, on_delete: :delete_all), null: false
      add :ip_address, :string
      add :user_agent, :string
      add :expires_at, :utc_datetime, null: false
      add :revoked_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end
  end
end
