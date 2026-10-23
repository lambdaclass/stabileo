defmodule StabileoUtils.Plugs.VersionHeader do
  @moduledoc """
  Handles version headers for API requests:
  - Adds X-App-Version response header
  - Validates X-Client-Version request header (rejects outdated clients)
  """
  import Plug.Conn

  @version "v" <> StabileoUtils.version()

  def init(opts), do: opts

  def call(conn, _opts) do
    conn = put_resp_header(conn, "x-app-version", @version)

    case get_req_header(conn, "x-client-version") do
      [client_version] ->
        if version_compatible?(client_version, @version) do
          conn
        else
          body =
            Jason.encode!(%{
              error: "client_outdated",
              message: "Client version outdated. Please refresh your browser.",
              current_version: @version,
              client_version: client_version
            })

          conn
          |> put_resp_content_type("application/json")
          |> send_resp(426, body)
          |> halt()
        end

      [] ->
        conn
    end
  end

  defp version_compatible?(client_version, server_version) do
    extract_major_minor(client_version) == extract_major_minor(server_version)
  end

  defp extract_major_minor(version) do
    version
    |> String.trim_leading("v")
    |> String.split(".")
    |> Enum.take(2)
    |> Enum.join(".")
  end
end
