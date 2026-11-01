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
  @numbers %{"cloud_projects_limit" => &Features.set_cloud_projects_limit/1}
  @settings Map.merge(@flags, @numbers)

  def show(conn, _params), do: json(conn, %{data: settings()})

  @doc """
  Sets any of the flags in `@flags` (booleans) and `@numbers`. At least one
  must be given; nothing is written unless all of them are valid.
  """
  def update(conn, params) do
    changes = Map.take(params, Map.keys(@settings))

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
      for {key, value} <- changes, message = invalid(key, value), into: %{}, do: {key, [message]}

    if errors == %{}, do: :ok, else: {:error, {:validation, errors}}
  end

  defp invalid("cloud_projects_limit", value) do
    range = Features.cloud_projects_limit_range()

    unless is_integer(value) and value in range,
      do: "must be a whole number from #{range.first} to #{range.last}"
  end

  defp invalid(_key, value), do: unless(is_boolean(value), do: "must be true or false")

  defp write(changes) do
    Enum.reduce_while(changes, :ok, fn {key, value}, :ok ->
      case Map.fetch!(@settings, key).(value) do
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
      cloud_projects_limit: Features.cloud_projects_limit(),
      terms_version: Consents.terms_version()
    }
  end
end
