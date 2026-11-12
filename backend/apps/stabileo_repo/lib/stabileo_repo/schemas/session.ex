defmodule StabileoRepo.Schemas.Session do
  @moduledoc """
  One login. A refresh token names its session, and is accepted only while the
  session is neither revoked nor expired.
  """

  use StabileoRepo.Schema
  import Ecto.Changeset

  alias StabileoRepo.Schemas.Account

  @type t :: %__MODULE__{}

  schema "sessions" do
    field(:ip_address, :string)
    field(:user_agent, :string)
    field(:expires_at, :utc_datetime)
    field(:revoked_at, :utc_datetime)

    belongs_to(:account, Account)

    timestamps()
  end

  @required_fields [:account_id, :expires_at]
  @optional_fields [:ip_address, :user_agent]

  def changeset(session, attrs) do
    session
    |> cast(attrs, @required_fields ++ @optional_fields)
    |> validate_required(@required_fields)
    |> foreign_key_constraint(:account_id)
  end

  def revoke_changeset(session) do
    change(session, revoked_at: DateTime.utc_now() |> DateTime.truncate(:second))
  end

  @doc "Sessions that outlived a sign-in code: an unexchanged Google code leaves a session of at most a minute."
  def lasting(query) do
    import Ecto.Query, only: [where: 3]
    where(query, [s], s.expires_at > fragment("? + interval '60 seconds'", s.inserted_at))
  end
end
