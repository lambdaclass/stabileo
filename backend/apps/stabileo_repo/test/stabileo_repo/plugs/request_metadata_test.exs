defmodule StabileoRepo.Plugs.RequestMetadataTest do
  use ExUnit.Case, async: false

  alias StabileoRepo.Plugs.RequestMetadata

  setup do
    on_exit(fn -> Application.delete_env(:stabileo_repo, :trusted_proxies) end)
  end

  defp client_ip(remote_ip, forwarded_for) do
    conn = Plug.Test.conn(:get, "/") |> Map.put(:remote_ip, remote_ip)

    conn =
      if forwarded_for,
        do: Plug.Conn.put_req_header(conn, "x-forwarded-for", forwarded_for),
        else: conn

    RequestMetadata.call(conn, []).assigns.client_ip
  end

  test "without trusted proxies the peer is the client, whatever the header says" do
    assert client_ip({203, 0, 113, 7}, nil) == "203.0.113.7"
    assert client_ip({203, 0, 113, 7}, "6.6.6.6") == "203.0.113.7"
  end

  test "behind a trusted proxy the client is the entry that proxy appended" do
    Application.put_env(:stabileo_repo, :trusted_proxies, ["10.0.0.2"])

    # The client sent "6.6.6.6"; the proxy appended the address it saw.
    assert client_ip({10, 0, 0, 2}, "6.6.6.6, 198.51.100.4") == "198.51.100.4"
  end

  test "a chain of trusted proxies is walked from the right" do
    Application.put_env(:stabileo_repo, :trusted_proxies, ["10.0.0.2", "10.0.0.3"])

    assert client_ip({10, 0, 0, 2}, "6.6.6.6, 198.51.100.4, 10.0.0.3") == "198.51.100.4"
  end

  test "a peer that is not a trusted proxy is not believed" do
    Application.put_env(:stabileo_repo, :trusted_proxies, ["10.0.0.2"])

    assert client_ip({203, 0, 113, 7}, "6.6.6.6") == "203.0.113.7"
  end

  test "a header with no usable entry falls back to the peer" do
    Application.put_env(:stabileo_repo, :trusted_proxies, ["10.0.0.2"])

    assert client_ip({10, 0, 0, 2}, "not-an-ip") == "10.0.0.2"
    assert client_ip({10, 0, 0, 2}, nil) == "10.0.0.2"
  end
end
