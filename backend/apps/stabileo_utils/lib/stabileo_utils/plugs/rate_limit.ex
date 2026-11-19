defmodule StabileoUtils.Plugs.RateLimit do
  @moduledoc """
  Limits by `conn.assigns.client_ip` (mount after `StabileoRepo.Plugs.RequestMetadata`), or with
  `key: :account` by `conn.assigns.current_account.id` (mount after the authentication plug).
  """

  import Plug.Conn

  alias StabileoUtils.RateLimit

  def init(opts) do
    %{
      bucket: Keyword.fetch!(opts, :bucket),
      limit: Keyword.fetch!(opts, :limit),
      period_ms: Keyword.fetch!(opts, :period_ms),
      key: Keyword.get(opts, :key, :ip)
    }
  end

  def call(conn, %{bucket: bucket, limit: limit, period_ms: period_ms, key: key}) do
    case RateLimit.hit(bucket, key(conn, key), limit, period_ms) do
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

  defp key(conn, :ip), do: conn.assigns[:client_ip]
  defp key(conn, :account), do: conn.assigns.current_account.id
end
