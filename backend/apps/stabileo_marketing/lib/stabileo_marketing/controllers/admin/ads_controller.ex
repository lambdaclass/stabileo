defmodule StabileoMarketing.Controllers.Admin.AdsController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoMarketing.Ads
  alias StabileoMarketing.Ads.Connections
  alias StabileoMarketing.Controllers.Admin.Period

  def overview(conn, params) do
    today = Ads.today()

    with {:ok, range} <- range(params, today),
         {:ok, channel} <- pick(params["channel"], ["all" | Ads.channels()], "all", :channel),
         {:ok, display} <- pick(params["display"], Ads.displays(), "USD", :display) do
      json(conn, %{data: Ads.overview(%{channel: channel, range: range, display: display, today: today})})
    end
  end

  def sync(conn, _params) do
    queued = Ads.accounts() |> Ads.enqueue_sync()
    conn |> put_status(:accepted) |> json(%{data: %{queued: queued}})
  end

  def connections(conn, _params), do: json(conn, %{data: Connections.check()})

  defp range(%{"from" => _, "to" => _} = params, today), do: Period.range(params, today)

  defp range(params, _today) do
    with {:ok, days} <- Period.days(params["days"]), do: {:ok, {:last_days, days}}
  end

  defp pick(nil, _allowed, default, _field), do: {:ok, default}

  defp pick(value, allowed, _default, field) do
    if value in allowed,
      do: {:ok, value},
      else: {:error, {:validation, %{field => ["must be one of #{Enum.join(allowed, ", ")}"]}}}
  end
end
