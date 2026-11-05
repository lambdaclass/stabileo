defmodule StabileoRepo.Schemas.AccountMilestone do
  @moduledoc false

  use StabileoRepo.Schema
  import Ecto.Changeset

  alias StabileoRepo.Schemas.Account

  @type t :: %__MODULE__{}

  @kinds ~w(first_analysis first_save first_export)

  @timestamps_opts [type: :utc_datetime, updated_at: false]

  schema "account_milestones" do
    field(:kind, :string)
    field(:occurred_at, :utc_datetime)

    belongs_to(:account, Account)

    timestamps()
  end

  def kinds, do: @kinds

  def changeset(milestone, attrs) do
    milestone
    |> cast(attrs, [:account_id, :kind, :occurred_at])
    |> validate_required([:account_id, :kind, :occurred_at])
    |> validate_inclusion(:kind, @kinds)
    |> assoc_constraint(:account)
    |> unique_constraint([:account_id, :kind])
  end
end
