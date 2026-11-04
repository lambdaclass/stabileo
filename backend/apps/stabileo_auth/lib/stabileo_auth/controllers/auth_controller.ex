defmodule StabileoAuth.Controllers.AuthController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  @register_fields ~w(email password name locale)

  def config(conn, _params), do: json(conn, StabileoAuth.config())

  def register(conn, params) do
    with {:ok, payload} <-
           StabileoAuth.register(Map.take(params, @register_fields), metadata(conn)) do
      conn
      |> put_status(:created)
      |> json(payload)
    end
  end

  def login(conn, %{"email" => email, "password" => password}) do
    with {:ok, payload} <- StabileoAuth.login(email, password, metadata(conn)) do
      json(conn, payload)
    end
  end

  def login(_conn, _params), do: {:error, :invalid_credentials}

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
