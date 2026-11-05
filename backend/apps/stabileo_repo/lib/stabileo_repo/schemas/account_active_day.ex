defmodule StabileoRepo.Schemas.AccountActiveDay do
  @moduledoc "`day` is a Buenos Aires day (`StabileoMarketing.Days`)."

  use StabileoRepo.Schema
  import Ecto.Changeset

  alias StabileoRepo.Schemas.Account

  @type t :: %__MODULE__{}

  schema "account_active_days" do
    field(:day, :date)

    belongs_to(:account, Account)
  end

  def changeset(day, attrs) do
    day
    |> cast(attrs, [:account_id, :day])
    |> validate_required([:account_id, :day])
    |> assoc_constraint(:account)
    |> unique_constraint([:account_id, :day])
  end
end
