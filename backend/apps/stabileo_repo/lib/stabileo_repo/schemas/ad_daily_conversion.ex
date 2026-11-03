defmodule StabileoRepo.Schemas.AdDailyConversion do
  @moduledoc "One day of one conversion type (a pixel event, a custom conversion, a Google action) for a campaign or ad."

  use StabileoRepo.Schema

  alias StabileoRepo.Schemas.AdAccount

  @type t :: %__MODULE__{}

  schema "ad_daily_conversions" do
    field(:date, :date)
    field(:level, :string)
    field(:external_id, :string)
    field(:campaign_external_id, :string)
    field(:conversion_key, :string)
    field(:conversion_name, :string)
    field(:conversion_group, :string)
    field(:count, :decimal, default: Decimal.new(0))

    belongs_to(:ad_account, AdAccount)
  end
end
