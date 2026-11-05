defmodule StabileoRepo.Schemas.SignupSource do
  @moduledoc false

  use StabileoRepo.Schema
  import Ecto.Changeset

  alias StabileoRepo.Schemas.Account

  @type t :: %__MODULE__{}

  @channels ~w(google meta search social referral email direct other)
  @strings ~w(utm_source utm_medium utm_campaign utm_content utm_term gclid gbraid wbraid fbclid network trigger placement)a
  @texts ~w(referrer landing_path)a

  @timestamps_opts [type: :utc_datetime, updated_at: false]

  schema "signup_sources" do
    field(:channel, :string)
    field(:paid, :boolean)
    field(:utm_source, :string)
    field(:utm_medium, :string)
    field(:utm_campaign, :string)
    field(:utm_content, :string)
    field(:utm_term, :string)
    field(:gclid, :string)
    field(:gbraid, :string)
    field(:wbraid, :string)
    field(:fbclid, :string)
    field(:network, :string)
    field(:referrer, :string)
    field(:landing_path, :string)
    field(:first_seen_at, :utc_datetime)
    field(:trigger, :string)
    field(:placement, :string)

    belongs_to(:account, Account)

    timestamps()
  end

  def channels, do: @channels

  def changeset(source, attrs) do
    changeset =
      source
      |> cast(attrs, [:account_id, :channel, :paid, :first_seen_at | @strings ++ @texts])
      |> validate_required([:account_id, :channel])
      |> validate_inclusion(:channel, @channels)

    @strings
    |> Enum.reduce(changeset, &validate_length(&2, &1, max: 255, count: :codepoints))
    |> validate_length(:referrer, max: 2048, count: :codepoints)
    |> validate_length(:landing_path, max: 2048, count: :codepoints)
    |> assoc_constraint(:account)
    |> unique_constraint(:account_id)
  end
end
