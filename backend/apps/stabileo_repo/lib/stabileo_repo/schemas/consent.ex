defmodule StabileoRepo.Schemas.Consent do
  @moduledoc "Append-only: a change is a new row."

  use StabileoRepo.Schema
  import Ecto.Changeset

  alias StabileoRepo.Schemas.Account

  @type t :: %__MODULE__{}

  @kinds ~w(terms usage_analytics model_research)

  @timestamps_opts [type: :utc_datetime_usec, updated_at: false]

  schema "consents" do
    field(:kind, :string)
    field(:version, :string)
    field(:granted, :boolean)
    field(:ip_address, :string)
    field(:user_agent, :string)

    belongs_to(:account, Account)

    timestamps()
  end

  def kinds, do: @kinds

  def changeset(consent, attrs) do
    consent
    |> cast(attrs, [:account_id, :kind, :version, :granted, :ip_address, :user_agent])
    |> validate_required([:account_id, :kind, :granted])
    |> validate_inclusion(:kind, @kinds)
    |> validate_length(:version, max: 32)
    |> validate_length(:ip_address, max: 64)
    |> validate_terms()
    |> assoc_constraint(:account)
  end

  defp validate_terms(changeset) do
    if get_field(changeset, :kind) == "terms" do
      changeset
      |> validate_required([:version])
      |> validate_acceptance(:granted)
    else
      changeset
    end
  end
end
