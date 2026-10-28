defmodule StabileoRepo.Repo.Migrations.CreateConsentsProjectsInsightsAndAdminActions do
  use Ecto.Migration

  def change do
    create table(:consents) do
      add :account_id, references(:accounts, on_delete: :delete_all), null: false
      add :kind, :string, null: false
      add :version, :string
      add :granted, :boolean, null: false
      add :ip_address, :string
      add :user_agent, :text

      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create table(:projects) do
      add :account_id, references(:accounts, on_delete: :delete_all), null: false
      add :name, :string, null: false
      add :app_mode, :string, null: false
      add :content, :binary, null: false
      add :content_bytes, :integer, null: false
      add :node_count, :integer
      add :element_count, :integer
      add :app_version, :string
      add :is_active, :boolean, null: false, default: true

      timestamps(type: :utc_datetime)
    end

    create table(:usage_events) do
      add :install_id, :string, null: false
      add :session_id, :string
      add :name, :string, null: false
      add :props, :map, null: false, default: %{}
      add :app_version, :string
      add :app_mode, :string
      add :locale, :string
      add :occurred_at, :utc_datetime, null: false

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create table(:feedback) do
      add :account_id, references(:accounts, on_delete: :nilify_all)
      add :kind, :string, null: false
      add :message, :text, null: false
      add :contact_email, :string
      add :page, :string
      add :app_version, :string
      add :user_agent, :text
      add :model_link, :text
      add :status, :string, null: false, default: "new"

      timestamps(type: :utc_datetime)
    end

    create table(:admin_actions) do
      add :admin_id, references(:accounts, on_delete: :nilify_all)
      add :action, :string, null: false
      add :target_type, :string
      add :target_id, :string
      add :details, :map, null: false, default: %{}

      timestamps(type: :utc_datetime, updated_at: false)
    end
  end
end
