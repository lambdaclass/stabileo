defmodule StabileoRepo.Schemas.Consent do
  @moduledoc """
  One decision an account made about a consent, at a moment: accepting the
  terms of use and privacy policy (`terms`, with the version accepted),
  sharing anonymous usage (`usage_analytics`), or letting its saved projects
  be used, anonymised, to improve Stabileo (`model_research`).

  Append-only: a change is a new row, so the table is the record of who agreed
  to what and when. The current state of a kind is its latest row.
  """

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
