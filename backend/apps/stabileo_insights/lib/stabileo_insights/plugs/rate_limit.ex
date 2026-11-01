defmodule StabileoInsights.Plugs.RateLimit do
  @moduledoc """
  Answers 429 once one signed-in account, or else one client address, sends
  more than `limit` requests in a `window_ms` window. Needs `client_ip` from
  `StabileoRepo.Plugs.RequestMetadata`.
  """

  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  alias StabileoInsights.RateLimit

  def init(opts) do
    %{
      scope: Keyword.fetch!(opts, :scope),
      limit: Keyword.fetch!(opts, :limit),
      window_ms: Keyword.get(opts, :window_ms, 60_000)
    }
  end

  def call(conn, %{scope: scope, limit: limit, window_ms: window_ms}) do
    case RateLimit.hit({scope, client(conn)}, limit, window_ms) do
      :ok ->
        conn

      {:error, :rate_limited} ->
        conn
        |> put_resp_header("retry-after", Integer.to_string(div(window_ms, 1000)))
        |> put_status(:too_many_requests)
        |> json(%{error: "rate_limited", message: "Too many requests, try again later"})
        |> halt()
    end
  end

  defp client(%{assigns: %{current_account: %{id: id}}}), do: {:account, id}
  defp client(conn), do: {:ip, conn.assigns[:client_ip]}
end
