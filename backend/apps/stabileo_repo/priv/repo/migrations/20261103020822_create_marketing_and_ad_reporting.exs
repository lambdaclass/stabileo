defmodule StabileoRepo.Repo.Migrations.CreateMarketingAndAdReporting do
  use Ecto.Migration

  def change do
    create table(:signup_sources) do
      add :account_id, references(:accounts, on_delete: :delete_all), null: false
      add :channel, :string, null: false
      add :paid, :boolean
      add :utm_source, :string
      add :utm_medium, :string
      add :utm_campaign, :string
      add :utm_content, :string
      add :utm_term, :string
      add :gclid, :string
      add :gbraid, :string
      add :wbraid, :string
      add :fbclid, :string
      add :network, :string
      add :referrer, :text
      add :landing_path, :text
      add :first_seen_at, :utc_datetime
      add :trigger, :string
      add :placement, :string

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create table(:account_milestones) do
      add :account_id, references(:accounts, on_delete: :delete_all), null: false
      add :kind, :string, null: false
      add :occurred_at, :utc_datetime, null: false

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create table(:account_active_days) do
      add :account_id, references(:accounts, on_delete: :delete_all), null: false
      add :day, :date, null: false
    end
  end
end
