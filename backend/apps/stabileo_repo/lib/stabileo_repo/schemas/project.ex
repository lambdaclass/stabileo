defmodule StabileoRepo.Schemas.Project do
  @moduledoc """
  A project an account saved to the cloud: the same `.ded` document the app
  writes to disk, stored gzipped in `content`, plus the metadata the project
  list and the admin site show without opening it (`content_bytes` is the
  size of the uncompressed document). Deleting sets `is_active` to false.
  """

  use StabileoRepo.Schema
  import Ecto.Changeset

  alias StabileoRepo.Schemas.Account

  @type t :: %__MODULE__{}

  @modes ~w(basic pro)

  schema "projects" do
    field(:name, :string)
    field(:app_mode, :string)
    field(:content, :binary, redact: true)
    field(:content_bytes, :integer)
    field(:node_count, :integer)
    field(:element_count, :integer)
    field(:app_version, :string)
    field(:is_active, :boolean, default: true)

    belongs_to(:account, Account)

    timestamps()
  end

  def modes, do: @modes

  @doc "A new project. `account_id` is set by the caller, not cast from input."
  def create_changeset(project, attrs) do
    project
    |> cast(attrs, [
      :account_id,
      :name,
      :app_mode,
      :content,
      :content_bytes,
      :node_count,
      :element_count,
      :app_version
    ])
    |> validate_required([:account_id, :name, :app_mode, :content, :content_bytes])
    |> validate_common()
    |> assoc_constraint(:account)
  end

  @doc "Rename and/or replace the content. Never moves a project to another account."
  def update_changeset(project, attrs) do
    project
    |> cast(attrs, [
      :name,
      :app_mode,
      :content,
      :content_bytes,
      :node_count,
      :element_count,
      :app_version
    ])
    |> validate_required([:name, :app_mode, :content, :content_bytes])
    |> validate_common()
  end

  defp validate_common(changeset) do
    changeset
    |> update_change(:name, &String.trim/1)
    |> validate_length(:name, min: 1, max: 200)
    |> validate_inclusion(:app_mode, @modes)
    |> validate_number(:content_bytes, greater_than: 0)
    |> validate_number(:node_count, greater_than_or_equal_to: 0)
    |> validate_number(:element_count, greater_than_or_equal_to: 0)
    |> validate_length(:app_version, max: 32)
  end
end
