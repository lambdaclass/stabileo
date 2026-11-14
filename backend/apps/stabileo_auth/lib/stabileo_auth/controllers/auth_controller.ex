defmodule StabileoAuth.Controllers.AuthController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  def config(conn, _params), do: json(conn, StabileoAuth.config())

  def refresh(conn, %{"refresh_token" => refresh_token}) do
    case StabileoAuth.refresh(refresh_token, metadata(conn)) do
      {:ok, payload} ->
        json(conn, payload)

      {:error, _reason} ->
        conn
        |> put_status(:unauthorized)
        |> json(%{error: "refresh_failed", message: "Invalid or expired refresh token"})
    end
  end

  def refresh(conn, _params), do: refresh(conn, %{"refresh_token" => nil})

  def logout(conn, params) do
    _ = StabileoAuth.logout(params["refresh_token"])
    json(conn, %{message: "Logged out"})
  end

  defp metadata(conn) do
    %{ip_address: conn.assigns[:client_ip], user_agent: conn.assigns[:user_agent]}
  end
end
