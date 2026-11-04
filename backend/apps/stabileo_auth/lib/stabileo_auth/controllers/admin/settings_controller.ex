defmodule StabileoAuth.Controllers.Admin.SettingsController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoRepo.Features

  def show(conn, _params), do: json(conn, %{data: settings()})

  def update(conn, %{"user_login_enabled" => enabled}) when is_boolean(enabled) do
    with {:ok, _setting} <- Features.set_user_login_enabled(enabled) do
      json(conn, %{data: settings()})
    end
  end

  def update(_conn, _params) do
    {:error, {:validation, %{user_login_enabled: ["must be true or false"]}}}
  end

  defp settings, do: %{user_login_enabled: Features.user_login_enabled?()}
end
