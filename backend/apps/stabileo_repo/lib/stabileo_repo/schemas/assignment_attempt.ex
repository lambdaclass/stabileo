defmodule StabileoRepo.Schemas.AssignmentAttempt do
  @moduledoc "`seed`, `started_at` and `deadline_at` are set by the server when the attempt starts and never change."

  use StabileoRepo.Schema
  import Ecto.Changeset

  alias StabileoRepo.Schemas.{Account, Assignment}

  @type t :: %__MODULE__{}

  @max_seed 4_294_967_295
  @max_answers_bytes 65_536

  schema "assignment_attempts" do
    field(:seed, :integer)
    field(:started_at, :utc_datetime)
    field(:deadline_at, :utc_datetime)
    field(:answers, :map, default: %{})
    field(:client_score, :float)
    field(:submitted_at, :utc_datetime)

    belongs_to(:assignment, Assignment)
    belongs_to(:account, Account)

    timestamps()
  end

  def max_answers_bytes, do: @max_answers_bytes

  def start_changeset(attempt, attrs) do
    attempt
    |> cast(attrs, [:assignment_id, :account_id, :seed, :started_at, :deadline_at])
    |> validate_required([:assignment_id, :account_id, :seed, :started_at, :deadline_at])
    |> validate_number(:seed, greater_than_or_equal_to: 0, less_than_or_equal_to: @max_seed)
    |> validate_deadline()
    |> assoc_constraint(:assignment)
    |> assoc_constraint(:account)
    |> unique_constraint([:assignment_id, :account_id])
  end

  def answers_changeset(attempt, attrs) do
    attempt
    |> cast(attrs, [:answers])
    |> validate_required([:answers])
    |> Assignment.validate_json_size(:answers, @max_answers_bytes)
  end

  def submit_changeset(attempt, attrs, submitted_at) do
    attempt
    |> cast(attrs, [:answers, :client_score])
    |> validate_required([:answers])
    |> Assignment.validate_json_size(:answers, @max_answers_bytes)
    |> validate_number(:client_score, greater_than_or_equal_to: 0, less_than_or_equal_to: 1)
    |> put_change(:submitted_at, submitted_at)
  end

  defp validate_deadline(changeset) do
    started_at = get_field(changeset, :started_at)
    deadline_at = get_field(changeset, :deadline_at)

    if started_at && deadline_at && DateTime.compare(deadline_at, started_at) == :lt,
      do: add_error(changeset, :deadline_at, "must not be before started_at"),
      else: changeset
  end
end
