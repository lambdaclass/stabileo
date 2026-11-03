defmodule StabileoRepo.Schemas.AdEntity do
  @moduledoc """
  A campaign, ad set (Google: ad group) or ad of an `AdAccount`, as the
  platform last described it. Written by the ads sync with `insert_all`.
  """

  use StabileoRepo.Schema

  alias StabileoRepo.Schemas.AdAccount

  @type t :: %__MODULE__{}

  schema "ad_entities" do
    field(:level, :string)
    field(:external_id, :string)
    field(:campaign_external_id, :string)
    field(:ad_group_external_id, :string)
    field(:name, :string)
    field(:status, :string)
    field(:objective, :string)
    field(:daily_budget, :decimal)
    field(:lifetime_budget, :decimal)
    field(:starts_on, :date)
    field(:ends_on, :date)
    field(:creative, :map)
    field(:details, :map)

    belongs_to(:ad_account, AdAccount)

    timestamps()
  end
end
