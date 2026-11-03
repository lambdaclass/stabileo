defmodule StabileoMarketing.Controllers.Admin.SettingsController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoAuth.AdminAudit
  alias StabileoMarketing.{Ads, Configs}
  alias StabileoRepo.Schemas.MarketingConfig

  def show(conn, _params), do: json(conn, %{data: view()})

  @doc """
  Saves any of the settings' fields and `sync_interval_minutes`. The history
  records which fields changed, never their values.
  """
  def update(conn, params) do
    fields = Map.take(params, Enum.map(MarketingConfig.fields(), &to_string/1))

    with :ok <- interval(params["sync_interval_minutes"]),
         {:ok, _config} <- save(fields) do
      AdminAudit.record(
        conn.assigns.current_account,
        "marketing.update",
        {"settings", "marketing"},
        %{"fields" => Map.keys(fields) ++ if(params["sync_interval_minutes"], do: ["sync_interval_minutes"], else: [])}
      )

      json(conn, %{data: view()})
    end
  end

  defp interval(nil), do: :ok

  defp interval(minutes) do
    with {:ok, _minutes} <- Ads.set_sync_interval_minutes(minutes), do: :ok
  end

  defp save(fields) when map_size(fields) == 0, do: {:ok, nil}
  defp save(fields), do: Configs.update(fields)

  defp view do
    Configs.admin_view()
    |> Map.put(:sync_interval_minutes, Ads.sync_interval_minutes())
  end
end
