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

    create table(:marketing_configs) do
      add :key, :string, null: false
      add :meta_pixel_id, :string
      add :meta_capi_access_token, :binary
      add :meta_capi_test_event_code, :string
      add :gtm_container_id, :string
      add :meta_ad_account_id, :string
      add :meta_ads_access_token, :binary
      add :google_ads_customer_id, :string
      add :google_ads_login_customer_id, :string
      add :google_ads_service_account, :binary

      timestamps(type: :utc_datetime)
    end

    create table(:ad_accounts) do
      add :channel, :string, null: false
      add :external_id, :string, null: false
      add :name, :string
      add :currency, :string
      add :sync_status, :string, null: false, default: "pending"
      add :last_synced_at, :utc_datetime
      add :last_sync_error, :text

      timestamps(type: :utc_datetime)
    end

    create table(:ad_entities) do
      add :ad_account_id, references(:ad_accounts, on_delete: :delete_all), null: false
      add :level, :string, null: false
      add :external_id, :string, null: false
      add :campaign_external_id, :string
      add :ad_group_external_id, :string
      add :name, :text
      add :status, :string
      add :objective, :string
      add :daily_budget, :decimal
      add :lifetime_budget, :decimal
      add :starts_on, :date
      add :ends_on, :date
      add :creative, :map
      add :details, :map

      timestamps(type: :utc_datetime)
    end

    create table(:ad_daily_metrics) do
      add :ad_account_id, references(:ad_accounts, on_delete: :delete_all), null: false
      add :date, :date, null: false
      add :level, :string, null: false
      add :external_id, :string, null: false
      add :campaign_external_id, :string
      add :ad_group_external_id, :string
      add :spend, :decimal, null: false, default: 0
      add :impressions, :decimal, null: false, default: 0
      add :reach, :decimal, null: false, default: 0
      add :clicks, :decimal, null: false, default: 0
      add :unique_clicks, :decimal
      add :signup_clicks, :decimal
      add :signups, :decimal, null: false, default: 0
      add :activations, :decimal
      add :results, :decimal, null: false, default: 0
      add :result_type, :string
    end

    create table(:ad_daily_conversions) do
      add :ad_account_id, references(:ad_accounts, on_delete: :delete_all), null: false
      add :date, :date, null: false
      add :level, :string, null: false
      add :external_id, :string, null: false
      add :campaign_external_id, :string
      add :conversion_key, :string, null: false
      add :conversion_name, :string
      add :conversion_group, :string
      add :count, :decimal, null: false, default: 0
    end

    create table(:ad_daily_budgets) do
      add :ad_account_id, references(:ad_accounts, on_delete: :delete_all), null: false
      add :date, :date, null: false
      add :campaign_external_id, :string, null: false
      add :budget, :decimal, null: false
      add :estimated, :boolean, null: false, default: false
    end

    create table(:ad_fx_rates, primary_key: false) do
      add :date, :date, primary_key: true
      add :usd_ars, :decimal, null: false
    end
  end
end
