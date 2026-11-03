defmodule StabileoRepo.Schemas.AdDailyMetric do
  @moduledoc """
  One day of delivery and results for a campaign, ad set or ad, in the
  account's currency. A sync replaces the days it downloads. `unique_clicks`,
  `signup_clicks` and `activations` are nil where the source does not measure
  them, which is not zero.
  """

  use StabileoRepo.Schema

  alias StabileoRepo.Schemas.AdAccount

  @type t :: %__MODULE__{}

  @metrics [:spend, :impressions, :reach, :clicks, :signups, :results]
  @optional [:unique_clicks, :signup_clicks, :activations]

  schema "ad_daily_metrics" do
    field(:date, :date)
    field(:level, :string)
    field(:external_id, :string)
    field(:campaign_external_id, :string)
    field(:ad_group_external_id, :string)

    for metric <- @metrics do
      field(metric, :decimal, default: Decimal.new(0))
    end

    for metric <- @optional do
      field(metric, :decimal)
    end

    field(:result_type, :string)

    belongs_to(:ad_account, AdAccount)
  end

  def metrics, do: @metrics
  def optional_metrics, do: @optional
end
