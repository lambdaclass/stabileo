defmodule StabileoRepo.Schemas.Assignment do
  @moduledoc "`exercise` is opaque to the server: it is stored and handed back, never read."

  use StabileoRepo.Schema
  import Ecto.Changeset

  alias StabileoRepo.Schemas.{Account, AssignmentAttempt}

  @type t :: %__MODULE__{}

  @reveals ~w(on_submit after_close)
  @max_exercise_bytes 262_144
  @editable [:title, :exercise, :duration_minutes, :opens_at, :closes_at, :reveal]

  schema "assignments" do
    field(:title, :string)
    field(:exercise, :map)
    field(:duration_minutes, :integer)
    field(:opens_at, :utc_datetime)
    field(:closes_at, :utc_datetime)
    field(:reveal, :string)
    field(:code, :string)

    belongs_to(:account, Account)
    has_many(:attempts, AssignmentAttempt)

    timestamps()
  end

  def reveals, do: @reveals
  def max_exercise_bytes, do: @max_exercise_bytes

  def create_changeset(assignment, attrs) do
    assignment
    |> cast(attrs, [:account_id, :code | @editable])
    |> validate_required([
      :account_id,
      :code,
      :title,
      :exercise,
      :duration_minutes,
      :opens_at,
      :reveal
    ])
    |> validate_format(:code, ~r/^[2-9A-HJ-NP-Z]{10}$/)
    |> validate_common()
    |> assoc_constraint(:account)
    |> unique_constraint(:code)
  end

  def update_changeset(assignment, attrs) do
    assignment
    |> cast(attrs, @editable)
    |> validate_required([:title, :exercise, :duration_minutes, :opens_at, :reveal])
    |> validate_common()
  end

  defp validate_common(changeset) do
    changeset
    |> update_change(:title, &String.trim/1)
    |> validate_required([:title])
    |> validate_length(:title, max: 120)
    |> validate_number(:duration_minutes, greater_than_or_equal_to: 1, less_than_or_equal_to: 600)
    |> validate_inclusion(:reveal, @reveals)
    |> validate_json_size(:exercise, @max_exercise_bytes)
    |> validate_window()
  end

  defp validate_window(changeset) do
    opens_at = get_field(changeset, :opens_at)
    closes_at = get_field(changeset, :closes_at)

    cond do
      closes_at && opens_at && DateTime.compare(closes_at, opens_at) != :gt ->
        add_error(changeset, :closes_at, "must be after opens_at")

      get_field(changeset, :reveal) == "after_close" and is_nil(closes_at) ->
        add_error(changeset, :closes_at, "is required when results show after closing")

      true ->
        changeset
    end
  end

  @doc false
  def validate_json_size(changeset, field, max) do
    validate_change(changeset, field, fn ^field, value ->
      if byte_size(Jason.encode!(value)) > max, do: [{field, "is too large"}], else: []
    end)
  end
end
