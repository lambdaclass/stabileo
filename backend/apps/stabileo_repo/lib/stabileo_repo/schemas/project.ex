defmodule StabileoRepo.Schemas.Project do
  @moduledoc "Deleting sets `is_active` to false and clears `content`."

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
    field(:revision, :integer, default: 1)

    belongs_to(:account, Account)

    timestamps()
  end

  def modes, do: @modes

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

  @doc "Fails with `revision: \"is stale\"` on `Repo.update(stale_error_field: :revision)` when another save came first."
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
    |> optimistic_lock(:revision)
  end

  def purge_changeset(project) do
    change(project, is_active: false, content: nil, content_bytes: 0)
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
