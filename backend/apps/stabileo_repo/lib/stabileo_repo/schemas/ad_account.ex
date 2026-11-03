defmodule StabileoRepo.Schemas.AdAccount do
  @moduledoc """
  A Meta Ads account (`act_…`) or Google Ads customer the Publicidad report
  reads. Created from the ids saved in Settings; the ads sync owns its rows.
  """

  use StabileoRepo.Schema
  import Ecto.Changeset

  @type t :: %__MODULE__{}

  @channels ~w(meta google)
  @statuses ~w(pending ok error not_connected)

  schema "ad_accounts" do
    field(:channel, :string)
    field(:external_id, :string)
    field(:name, :string)
    field(:currency, :string)
    field(:sync_status, :string, default: "pending")
    field(:last_synced_at, :utc_datetime)
    field(:last_sync_error, :string)

    timestamps()
  end

  def channels, do: @channels

  def changeset(account, attrs) do
    account
    |> cast(attrs, [
      :channel,
      :external_id,
      :name,
      :currency,
      :sync_status,
      :last_synced_at,
      :last_sync_error
    ])
    |> validate_required([:channel, :external_id, :sync_status])
    |> validate_inclusion(:channel, @channels)
    |> validate_inclusion(:sync_status, @statuses)
    |> unique_constraint([:channel, :external_id])
  end
end
