defmodule StabileoRepo.Schemas.SystemSetting do
  @moduledoc """
  A runtime setting: one JSON map per `key`. Read and written through
  `StabileoRepo.SystemSettings`.
  """

  use StabileoRepo.Schema
  import Ecto.Changeset

  @type t :: %__MODULE__{}

  schema "system_settings" do
    field(:key, :string)
    field(:value, :map, default: %{})
    field(:description, :string)

    timestamps()
  end

  def changeset(setting, attrs) do
    setting
    |> cast(attrs, [:key, :value, :description])
    |> validate_required([:key, :value])
    |> validate_length(:key, max: 255)
    |> unique_constraint(:key)
  end
end
