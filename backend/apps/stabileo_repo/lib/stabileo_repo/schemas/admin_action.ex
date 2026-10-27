defmodule StabileoRepo.Schemas.AdminAction do
  @moduledoc """
  What an admin did on the admin site: who (`admin_id`), what (`action`, such
  as `account.disable`), to what (`target_type` and `target_id`) and the
  details worth keeping. Append-only.
  """

  use StabileoRepo.Schema
  import Ecto.Changeset

  alias StabileoRepo.Schemas.Account

  @type t :: %__MODULE__{}

  @timestamps_opts [type: :utc_datetime, updated_at: false]

  schema "admin_actions" do
    field(:action, :string)
    field(:target_type, :string)
    field(:target_id, :string)
    field(:details, :map, default: %{})

    belongs_to(:admin, Account)

    timestamps()
  end

  def changeset(action, attrs) do
    action
    |> cast(attrs, [:admin_id, :action, :target_type, :target_id, :details])
    |> validate_required([:admin_id, :action])
    |> validate_format(:action, ~r/^[a-z_]+\.[a-z_]+$/)
    |> validate_length(:target_type, max: 32)
    |> validate_length(:target_id, max: 64)
    |> assoc_constraint(:admin)
  end
end
