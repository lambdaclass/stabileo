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
    create unique_index(:marketing_configs, [:key], concurrently: true)
    create unique_index(:ad_accounts, [:channel, :external_id], concurrently: true)

    create unique_index(:ad_entities, [:ad_account_id, :level, :external_id],
             concurrently: true
           )

    create unique_index(:ad_daily_metrics, [:ad_account_id, :level, :external_id, :date],
             concurrently: true
           )

    create index(:ad_daily_metrics, [:ad_account_id, :date], concurrently: true)

    create unique_index(
             :ad_daily_conversions,
             [:ad_account_id, :level, :external_id, :date, :conversion_key],
             concurrently: true
           )

    create unique_index(:ad_daily_budgets, [:ad_account_id, :date, :campaign_external_id],
             concurrently: true
           )
  end
end
