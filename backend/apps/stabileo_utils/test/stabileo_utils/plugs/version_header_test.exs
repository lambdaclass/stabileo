defmodule StabileoUtils.Plugs.VersionHeaderTest do
  use ExUnit.Case, async: true
  import Plug.Test
  import Plug.Conn

  alias StabileoUtils.Plugs.VersionHeader

  describe "init/1" do
    test "returns options unchanged" do
      assert VersionHeader.init([]) == []
      assert VersionHeader.init(some: :option) == [some: :option]
    end
  end

  describe "call/2" do
    test "adds X-App-Version response header" do
      conn =
        conn(:get, "/")
        |> VersionHeader.call([])

      version = get_resp_header(conn, "x-app-version") |> List.first()
      assert version =~ ~r/^v\d+\.\d+\.\d+$/
    end

    test "allows request when no X-Client-Version header is present" do
      conn =
        conn(:get, "/")
        |> VersionHeader.call([])

      refute conn.halted
    end

    test "allows request when client version matches server version" do
      probe_conn = conn(:get, "/") |> VersionHeader.call([])
      server_version = get_resp_header(probe_conn, "x-app-version") |> List.first()

      conn =
        conn(:get, "/")
        |> put_req_header("x-client-version", server_version)
        |> VersionHeader.call([])

      refute conn.halted
    end

    test "allows request when only patch version differs" do
      probe_conn = conn(:get, "/") |> VersionHeader.call([])
      server_version = get_resp_header(probe_conn, "x-app-version") |> List.first()

      [major, minor, _patch] =
        server_version
        |> String.trim_leading("v")
        |> String.split(".")

      client_version = "v#{major}.#{minor}.99"

      conn =
        conn(:get, "/")
        |> put_req_header("x-client-version", client_version)
        |> VersionHeader.call([])

      refute conn.halted
    end

    test "rejects request with 426 when major version differs" do
      conn =
        conn(:get, "/")
        |> put_req_header("x-client-version", "v0.0.0")
        |> VersionHeader.call([])

      assert conn.halted
      assert conn.status == 426
      assert get_resp_header(conn, "content-type") |> List.first() =~ "application/json"

      body = Jason.decode!(conn.resp_body)
      assert body["error"] == "client_outdated"
      assert body["message"] == "Client version outdated. Please refresh your browser."
      assert body["client_version"] == "v0.0.0"
      assert body["current_version"] =~ ~r/^v\d+\.\d+\.\d+$/
    end

    test "rejects request with 426 when minor version differs" do
      probe_conn = conn(:get, "/") |> VersionHeader.call([])
      server_version = get_resp_header(probe_conn, "x-app-version") |> List.first()

      [major, minor, _patch] =
        server_version
        |> String.trim_leading("v")
        |> String.split(".")

      different_minor = String.to_integer(minor) + 1
      client_version = "v#{major}.#{different_minor}.0"

      conn =
        conn(:get, "/")
        |> put_req_header("x-client-version", client_version)
        |> VersionHeader.call([])

      assert conn.halted
      assert conn.status == 426
    end

    test "handles client version without v prefix" do
      probe_conn = conn(:get, "/") |> VersionHeader.call([])
      server_version = get_resp_header(probe_conn, "x-app-version") |> List.first()

      client_version = String.trim_leading(server_version, "v")

      conn =
        conn(:get, "/")
        |> put_req_header("x-client-version", client_version)
        |> VersionHeader.call([])

      refute conn.halted
    end

    test "response includes X-App-Version header even when rejecting" do
      conn =
        conn(:get, "/")
        |> put_req_header("x-client-version", "v0.0.0")
        |> VersionHeader.call([])

      version = get_resp_header(conn, "x-app-version") |> List.first()
      assert version =~ ~r/^v\d+\.\d+\.\d+$/
    end
  end
end
