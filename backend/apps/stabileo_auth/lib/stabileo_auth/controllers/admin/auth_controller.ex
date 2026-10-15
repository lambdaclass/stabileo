defmodule StabileoAuth.Controllers.Admin.AuthController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoAuth.{AccountJSON, Admin}

  def login(conn, %{"email" => email, "password" => password}) do
    with {:ok, payload} <- Admin.login(email, password, metadata(conn)) do
      json(conn, payload)
    end
  end

  def login(_conn, _params), do: {:error, :invalid_credentials}

  def refresh(conn, params) do
    case Admin.refresh(params["refresh_token"], metadata(conn)) do
      {:ok, payload} ->
        json(conn, payload)

      {:error, _reason} ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "refresh_failed", message: "Invalid or expired refresh token"})
    end
  end

  def logout(conn, params) do
    _ = StabileoAuth.logout(params["refresh_token"])
    json(conn, %{message: "Logged out"})
  end

  def me(conn, _params) do
    json(conn, %{data: AccountJSON.render(conn.assigns.current_account)})
  end

  defp metadata(conn) do
    %{ip_address: conn.assigns[:client_ip], user_agent: conn.assigns[:user_agent]}
  end
end
