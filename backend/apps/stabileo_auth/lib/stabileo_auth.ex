defmodule StabileoAuth do
  @moduledoc """
  Login-equivalent flows. Each one answers with a session payload: a fresh
  access/refresh token pair and the account. `app` is `"app"` for the product
  and `"admin"` for the admin site; a refresh token only refreshes for the app
  it was issued to.
  """

  alias StabileoAuth.{AccountJSON, Accounts, Sessions, Tokens}
  alias StabileoRepo.Schemas.{Account, Session}

  def register(attrs, metadata \\ %{}) do
    with {:ok, account} <- Accounts.register(attrs) do
      start_session(account, metadata, "app")
    end
  end

  def login(email, password, metadata \\ %{}) do
    with {:ok, account} <- Accounts.authenticate(email, password) do
      sign_in(account, metadata, "app")
    end
  end

  def refresh(refresh_token, metadata \\ %{}, app \\ "app", allowed? \\ fn _ -> true end) do
    with {:ok, old_session, %{"app" => ^app}} <- Sessions.verify_refresh_token(refresh_token),
         %Account{is_active: true} = account <- Accounts.get_account(old_session.account_id),
         true <- allowed?.(account),
         {:ok, session} <-
           Sessions.rotate_session(old_session, metadata, Tokens.refresh_token_ttl(app)) do
      session_payload(account, session, app)
    else
      {:ok, _session, _claims} -> {:error, :invalid_token_type}
      %Account{} -> {:error, :account_disabled}
      false -> {:error, :forbidden}
      nil -> {:error, :account_not_found}
      {:error, reason} -> {:error, reason}
    end
  end

  def logout(refresh_token) do
    with {:ok, session, _claims} <- Sessions.verify_refresh_token(refresh_token) do
      Sessions.revoke_session(session)
    end
  end

  @doc false
  def sign_in(%Account{} = account, metadata, app) do
    with {:ok, account} <- Accounts.record_sign_in(account) do
      start_session(account, metadata, app)
    end
  end

  defp start_session(account, metadata, app) do
    with {:ok, session} <-
           Sessions.create_session(account, metadata, Tokens.refresh_token_ttl(app)) do
      session_payload(account, session, app)
    end
  end

  defp session_payload(%Account{} = account, %Session{} = session, app) do
    with {:ok, access_token} <- Tokens.generate_access_token(account, session, app),
         {:ok, refresh_token} <- Tokens.generate_refresh_token(session, app) do
      {:ok,
       %{
         access_token: access_token,
         refresh_token: refresh_token,
         expires_in: Tokens.access_token_ttl(),
         account: AccountJSON.render(account)
       }}
    end
  end
end
