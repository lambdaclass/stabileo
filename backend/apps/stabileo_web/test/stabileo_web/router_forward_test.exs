defmodule StabileoWeb.RouterForwardTest do
  use StabileoWeb.ConnCase, async: true

  test "each prefix reaches the router that owns it", %{conn: conn} do
    for path <- [
          "/api/v1/projects",
          "/api/v1/admin/projects",
          "/api/v1/admin/insights/summary",
          "/api/v1/admin/users"
        ] do
      body = conn |> get(path) |> json_response(401)
      assert body["error"] == "missing_token", "#{path} answered #{inspect(body)}"
    end

    body =
      build_conn()
      |> put_req_header("content-type", "application/json")
      |> post(
        "/api/v1/insights/events",
        Jason.encode!(%{install_id: "5f0c2c3e-8a7b", events: []})
      )
      |> json_response(422)

    assert body["details"]["events"]
  end
end
