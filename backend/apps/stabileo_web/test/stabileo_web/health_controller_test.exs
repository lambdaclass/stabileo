defmodule StabileoWeb.HealthControllerTest do
  use StabileoWeb.ConnCase, async: true

  test "GET /api/v1/health reports a reachable, migrated database", %{conn: conn} do
    body = conn |> get("/api/v1/health") |> json_response(200)

    assert body["status"] == "pass"
    assert body["version"] == StabileoUtils.BuildInfo.version()
    assert body["checks"]["database"]["status"] == "pass"
    assert body["checks"]["migrations"] == %{"status" => "pass", "pending" => 0}
  end

  test "every response carries the app version", %{conn: conn} do
    conn = get(conn, "/api/v1/health")
    assert get_resp_header(conn, "x-app-version") == [StabileoUtils.BuildInfo.version()]
  end
end
