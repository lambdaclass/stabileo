defmodule StabileoAuth.Controllers.Admin.SettingsController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoAuth.{AdminAudit, Consents}
  alias StabileoRepo.Features

  @flags %{
    "user_login_enabled" => &Features.set_user_login_enabled/1,
    "usage_telemetry_enabled" => &Features.set_usage_telemetry_enabled/1,
    "cloud_projects_enabled" => &Features.set_cloud_projects_enabled/1,
    "save_requires_account" => &Features.set_save_requires_account/1
  }

  def show(conn, _params), do: json(conn, %{data: settings()})

  @doc """
  Sets any of the flags in `@flags`. Every flag given must be a boolean, and
  at least one must be given; nothing is written unless all of them are valid.
  """
  def update(conn, params) do
    changes = Map.take(params, Map.keys(@flags))

    with :ok <- validate(changes),
         :ok <- write(changes) do
      AdminAudit.record(
        conn.assigns.current_account,
        "settings.update",
        {"settings", "flags"},
        changes
      )

      json(conn, %{data: settings()})
    end
  end

  defp validate(changes) when map_size(changes) == 0 do
    {:error, {:validation, Map.new(@flags, fn {key, _} -> {key, ["must be true or false"]} end)}}
  end

  defp validate(changes) do
    errors =
      for {key, value} <- changes,
          not is_boolean(value),
          into: %{},
          do: {key, ["must be true or false"]}

    if errors == %{}, do: :ok, else: {:error, {:validation, errors}}
  end

  defp write(changes) do
    Enum.reduce_while(changes, :ok, fn {key, value}, :ok ->
      case Map.fetch!(@flags, key).(value) do
        {:ok, _} -> {:cont, :ok}
        {:error, reason} -> {:halt, {:error, reason}}
      end
    end)
  end

  defp settings do
    %{
      user_login_enabled: Features.user_login_enabled?(),
      usage_telemetry_enabled: Features.usage_telemetry_enabled?(),
      cloud_projects_enabled: Features.cloud_projects_enabled?(),
      save_requires_account: Features.save_requires_account?(),
      terms_version: Consents.terms_version()
    }
  end
end
