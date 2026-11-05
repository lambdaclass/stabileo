defmodule StabileoRepo.Schemas.UsageEvent do
  @moduledoc "Never tied to an account; `props` must never carry model contents, file names or values."

  use StabileoRepo.Schema
  import Ecto.Changeset

  @type t :: %__MODULE__{}

  @timestamps_opts [type: :utc_datetime, updated_at: false]

  @name_format ~r/^[a-z][a-z0-9_.:-]{0,63}$/
  @id_format ~r/^[A-Za-z0-9-]{8,64}$/

  schema "usage_events" do
    field(:install_id, :string)
    field(:session_id, :string)
    field(:name, :string)
    field(:props, :map, default: %{})
    field(:app_version, :string)
    field(:app_mode, :string)
    field(:locale, :string)
    field(:occurred_at, :utc_datetime)

    timestamps()
  end

  def changeset(event, attrs) do
    event
    |> cast(attrs, [
      :install_id,
      :session_id,
      :name,
      :props,
      :app_version,
      :app_mode,
      :locale,
      :occurred_at
    ])
    |> validate_required([:install_id, :name, :occurred_at])
    |> validate_format(:install_id, @id_format)
    |> validate_format(:session_id, @id_format)
    |> validate_format(:name, @name_format)
    |> validate_length(:app_version, max: 32)
    |> validate_length(:app_mode, max: 16)
    |> validate_length(:locale, max: 8)
  end
end
