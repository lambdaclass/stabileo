defmodule StabileoRepo.Schemas.AdFxRate do
  @moduledoc "The official selling rate of the dollar in pesos on a day, to show ad spend in either currency."

  use Ecto.Schema

  @primary_key {:date, :date, autogenerate: false}

  @type t :: %__MODULE__{}

  schema "ad_fx_rates" do
    field(:usd_ars, :decimal)
  end
end
