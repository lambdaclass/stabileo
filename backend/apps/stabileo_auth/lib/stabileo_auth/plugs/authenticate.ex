defmodule StabileoAuth.Plugs.Authenticate do
  @moduledoc """
  Verifies the bearer access token and assigns `current_account` and
  `current_session_id`. Halts with 401 otherwise.

  `app: "admin"` accepts only admin-site tokens, and only while the account is
  still an admin; the default accepts only product tokens.
  """

  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  require Logger

  alias StabileoAuth.{Accounts, AdminAccess, Tokens}
  alias StabileoRepo.Schemas.Account

  def init(opts), do: Keyword.get(opts, :app, "app")

  def call(conn, app) do
    with {:ok, token} <- bearer_token(conn),
         {:ok, %{"app" => ^app} = claims} <- Tokens.verify_access_token(token),
         {:ok, account} <- load_account(claims["sub"]),
         :ok <- authorize(app, account) do
      Logger.metadata(account_id: account.id)

      conn
      |> assign(:current_account, account)
      |> assign(:current_session_id, claims["session_id"])
    else
      {:error, :missing_token} ->
        unauthorized(conn, "missing_token", "Authorization header required")

      {:error, :account_disabled} ->
        unauthorized(conn, "account_disabled", "Your account has been disabled")

      {:error, :not_admin} ->
        unauthorized(conn, "not_admin", "This account is not an admin")

      _ ->
        unauthorized(conn, "invalid_token", "Invalid or expired token")
    end
  end

  defp bearer_token(conn) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token] when token != "" -> {:ok, token}
      _ -> {:error, :missing_token}
    end
  end

  defp load_account(account_id) do
    case Accounts.get_account(account_id) do
      %Account{is_active: true} = account -> {:ok, account}
      %Account{} -> {:error, :account_disabled}
      nil -> {:error, :account_not_found}
    end
  end

  defp authorize("admin", account) do
    if AdminAccess.admin?(account), do: :ok, else: {:error, :not_admin}
  end

  defp authorize(_app, _account), do: :ok

  defp unauthorized(conn, code, message) do
    conn
    |> put_status(:unauthorized)
    |> json(%{error: code, message: message})
    |> halt()
  end
end
