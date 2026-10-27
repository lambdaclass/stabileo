defmodule StabileoAuth do
  @moduledoc """
  Login-equivalent flows. Each one answers with a session payload: a fresh
  access/refresh token pair and the account. `app` is `"app"` for the product
  and `"admin"` for the admin site; a refresh token only refreshes for the app
  it was issued to.
  """

  alias StabileoAuth.{AccountJSON, Accounts, Consents, Sessions, Tokens}
  alias StabileoRepo.{Features, Repo}
  alias StabileoRepo.Schemas.{Account, Session}

  @doc """
  Closed while `user_login_enabled` is off; see `StabileoRepo.Features`.

  Needs `"accept_terms" => true`: the account and the acceptance of the terms
  in force are written together, with the optional `"usage_analytics"` and
  `"model_research"` choices when given.
  """
  def register(attrs, metadata \\ %{}) do
    with :ok <- user_login_open(),
         {:ok, account} <- create_account(attrs, metadata) do
      start_session(account, metadata, "app")
    end
  end

  defp create_account(attrs, metadata) do
    changeset = attrs |> Account.registration_changeset() |> require_terms(attrs)

    Repo.transaction(fn ->
      with {:ok, account} <- Repo.insert(changeset),
           {:ok, :ok} <- Consents.record_sign_up(account, attrs, metadata) do
        account
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp require_terms(changeset, %{"accept_terms" => true}), do: changeset

  defp require_terms(changeset, _attrs),
    do: Ecto.Changeset.add_error(changeset, :accept_terms, "must be accepted")

  @doc "Closed while `user_login_enabled` is off. Refresh is not: existing sessions keep working."
  def login(email, password, metadata \\ %{}) do
    with :ok <- user_login_open(),
         {:ok, account} <- Accounts.authenticate(email, password) do
      sign_in(account, metadata, "app")
    end
  end

  def config do
    %{
      user_login_enabled: Features.user_login_enabled?(),
      terms_version: Consents.terms_version(),
      usage_telemetry_enabled: Features.usage_telemetry_enabled?(),
      cloud_projects_enabled: Features.cloud_projects_enabled?()
    }
  end

  defp user_login_open do
    if Features.user_login_enabled?(), do: :ok, else: {:error, :user_login_disabled}
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

  @doc false
  def session_payload(%Account{} = account, %Session{} = session, app) do
    with {:ok, access_token} <- Tokens.generate_access_token(account, session, app),
         {:ok, refresh_token} <- Tokens.generate_refresh_token(session, app) do
      {:ok,
       %{
         access_token: access_token,
         refresh_token: refresh_token,
         expires_in: Tokens.access_token_ttl(),
         account: AccountJSON.render_with_consents(account)
       }}
    end
  end
end
