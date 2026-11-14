defmodule StabileoUtils.Plugs.RateLimit do
  @moduledoc "Mount after `StabileoRepo.Plugs.RequestMetadata`: it limits by `conn.assigns.client_ip`."

  import Plug.Conn

  alias StabileoUtils.RateLimit

  def init(opts) do
    %{
      bucket: Keyword.fetch!(opts, :bucket),
      limit: Keyword.fetch!(opts, :limit),
      period_ms: Keyword.fetch!(opts, :period_ms)
    }
  end

  def call(conn, %{bucket: bucket, limit: limit, period_ms: period_ms}) do
    case RateLimit.hit(bucket, conn.assigns[:client_ip], limit, period_ms) do
      :ok ->
        conn

      {:error, :rate_limited} ->
        conn
        |> put_resp_content_type("application/json")
        |> put_resp_header("retry-after", Integer.to_string(div(period_ms, 1000)))
        |> send_resp(
          429,
          Jason.encode!(%{error: "rate_limited", message: "Too many requests. Try again later."})
        )
        |> halt()
    end
  end
end
