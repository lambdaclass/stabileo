defmodule StabileoRepo.Plugs.RequestMetadata do
  @moduledoc """
  Extracts request metadata (IP, User-Agent) for audit logging.
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    ip_address = get_client_ip(conn)
    user_agent = get_req_header(conn, "user-agent") |> List.first()

    conn
    |> assign(:client_ip, ip_address)
    |> assign(:user_agent, user_agent)
  end

  defp get_client_ip(conn) do
    forwarded_for = get_req_header(conn, "x-forwarded-for") |> List.first()

    case forwarded_for do
      nil ->
        conn.remote_ip |> :inet.ntoa() |> to_string()

      value ->
        value
        |> String.split(",")
        |> List.first()
        |> String.trim()
    end
  end
end
