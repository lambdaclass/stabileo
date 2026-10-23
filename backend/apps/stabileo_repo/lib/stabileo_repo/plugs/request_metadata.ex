defmodule StabileoRepo.Plugs.RequestMetadata do
  @moduledoc """
  Extracts request metadata (IP, User-Agent) for audit logging.

  The client IP is the connection's peer, unless the peer is a trusted proxy
  (`config :stabileo_repo, :trusted_proxies`, a list of IP addresses; none by
  default). Then it is the right-most `X-Forwarded-For` entry that is not a
  trusted proxy: a client writes what it likes into the header and each proxy
  appends to it, so only the entries the trusted proxies added are worth reading.
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
    trusted = trusted_proxies()

    ip =
      if conn.remote_ip in trusted,
        do: forwarded_client(conn, trusted) || conn.remote_ip,
        else: conn.remote_ip

    ip |> :inet.ntoa() |> to_string()
  end

  # Walks the header from the right, past the trusted proxies; an entry that is
  # not an address ends the walk with nothing.
  defp forwarded_client(conn, trusted) do
    conn
    |> get_req_header("x-forwarded-for")
    |> Enum.flat_map(&String.split(&1, ","))
    |> Enum.reverse()
    |> Enum.reduce_while(nil, fn entry, nil -> step(parse_ip(entry), trusted) end)
  end

  defp step(nil, _trusted), do: {:halt, nil}
  defp step(ip, trusted), do: if(ip in trusted, do: {:cont, nil}, else: {:halt, ip})

  defp trusted_proxies do
    :stabileo_repo
    |> Application.get_env(:trusted_proxies, [])
    |> Enum.map(&parse_ip/1)
    |> Enum.reject(&is_nil/1)
  end

  defp parse_ip(value) do
    case value |> String.trim() |> String.to_charlist() |> :inet.parse_address() do
      {:ok, ip} -> ip
      {:error, _} -> nil
    end
  end
end
