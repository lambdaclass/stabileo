defmodule StabileoAuth.Sessions do
  @moduledoc """
  Refresh-token sessions. A refresh token is valid only while its session row
  is neither revoked nor expired.
  """

  import Ecto.Query

  alias StabileoAuth.Tokens
  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.{Account, Session}

  def create_session(%Account{} = account, metadata \\ %{}, ttl \\ Tokens.refresh_token_ttl()) do
    %Session{}
    |> Session.changeset(session_attrs(account.id, metadata, ttl))
    |> Repo.insert()
  end

  def get_session(id) do
    case Ecto.UUID.cast(id) do
      {:ok, uuid} -> Repo.get(Session, uuid)
      :error -> nil
    end
  end

  def verify_refresh_token(token) do
    with {:ok, claims} <- Tokens.verify_refresh_token(token),
         %Session{} = session <- get_session(claims["session_id"]),
         :ok <- validate_session(session) do
      {:ok, session, claims}
    else
      nil -> {:error, :session_not_found}
      {:error, reason} -> {:error, reason}
    end
  end

  @doc "Revokes `old_session` and opens a new one, atomically."
  def rotate_session(%Session{} = old_session, metadata \\ %{}, ttl \\ Tokens.refresh_token_ttl()) do
    Repo.transaction(fn ->
      # Without the row lock two concurrent refreshes of one token both mint a session.
      locked =
        Session
        |> where([s], s.id == ^old_session.id)
        |> lock("FOR UPDATE")
        |> Repo.one()

      case locked do
        nil ->
          Repo.rollback(:session_not_found)

        %Session{revoked_at: %DateTime{}} ->
          Repo.rollback(:session_revoked)

        session ->
          session |> Session.revoke_changeset() |> Repo.update!()

          metadata = %{
            ip_address: metadata[:ip_address] || session.ip_address,
            user_agent: metadata[:user_agent] || session.user_agent
          }

          %Session{}
          |> Session.changeset(session_attrs(session.account_id, metadata, ttl))
          |> Repo.insert!()
      end
    end)
  end

  def revoke_session(%Session{} = session) do
    session |> Session.revoke_changeset() |> Repo.update()
  end

  def revoke_all_except(account_id, nil), do: revoke_all(account_id)

  def revoke_all_except(account_id, except_session_id) do
    {count, _} =
      Session
      |> where([s], s.account_id == ^account_id and is_nil(s.revoked_at))
      |> where([s], s.id != ^except_session_id)
      |> Repo.update_all(set: [revoked_at: DateTime.utc_now() |> DateTime.truncate(:second)])

    {:ok, count}
  end

  def validate_session(%Session{revoked_at: %DateTime{}}), do: {:error, :session_revoked}

  def validate_session(%Session{expires_at: expires_at}) do
    if DateTime.compare(expires_at, DateTime.utc_now()) == :gt,
      do: :ok,
      else: {:error, :session_expired}
  end

  @doc "Revokes every live session of the account. Answers how many were revoked."
  def revoke_all(account_id) do
    {count, _} =
      Session
      |> where([s], s.account_id == ^account_id and is_nil(s.revoked_at))
      |> Repo.update_all(set: [revoked_at: DateTime.utc_now() |> DateTime.truncate(:second)])

    {:ok, count}
  end

  def count_live(account_ids) when is_list(account_ids) do
    now = DateTime.utc_now()

    Session
    |> where([s], s.account_id in ^account_ids and is_nil(s.revoked_at) and s.expires_at > ^now)
    |> group_by([s], s.account_id)
    |> select([s], {s.account_id, count(s.id)})
    |> Repo.all()
    |> Map.new()
  end

  @doc """
  When each account last used Stabileo: its newest session. An open app
  refreshes its session every few minutes, and each refresh starts a new one.
  """
  def last_active([]), do: %{}

  def last_active(account_ids) when is_list(account_ids) do
    Session
    |> where([s], s.account_id in ^account_ids)
    |> group_by([s], s.account_id)
    |> select([s], {s.account_id, max(s.inserted_at)})
    |> Repo.all()
    |> Map.new()
  end

  defp session_attrs(account_id, metadata, ttl) do
    %{
      account_id: account_id,
      ip_address: metadata[:ip_address],
      user_agent: metadata[:user_agent] && String.slice(metadata[:user_agent], 0, 255),
      expires_at:
        DateTime.utc_now()
        |> DateTime.truncate(:second)
        |> DateTime.add(ttl, :second)
    }
  end
end
