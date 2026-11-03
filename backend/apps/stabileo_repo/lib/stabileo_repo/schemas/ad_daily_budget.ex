defmodule StabileoRepo.Schemas.AdDailyBudget do
  @moduledoc """
  A campaign's daily budget on a day, in the account's currency. Kept here
  because Google Ads only reports budget changes for the last 30 days;
  `estimated` marks the days before that window.
  """

  use StabileoRepo.Schema

  alias StabileoRepo.Schemas.AdAccount

  @type t :: %__MODULE__{}

  schema "ad_daily_budgets" do
    field(:date, :date)
    field(:campaign_external_id, :string)
    field(:budget, :decimal)
    field(:estimated, :boolean, default: false)

    belongs_to(:ad_account, AdAccount)
  end
end
