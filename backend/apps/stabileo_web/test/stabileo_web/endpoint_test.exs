defmodule StabileoWeb.EndpointTest do
  use StabileoWeb.ConnCase, async: true

  test "a JSON request goes through the endpoint into the auth router", %{conn: conn} do
    account = StabileoRepo.Factory.insert(:account)
    {:ok, session} = StabileoAuth.sign_in(account, %{}, "app")

    body =
      conn
      |> put_req_header("content-type", "application/json")
      |> post("/api/v1/auth/refresh", Jason.encode!(%{refresh_token: session.refresh_token}))
      |> json_response(200)

    assert body["account"]["id"] == account.id

    me =
      build_conn()
      |> put_req_header("authorization", "Bearer " <> body["access_token"])
      |> get("/api/v1/auth/me")
      |> json_response(200)

    assert me["data"]["id"] == account.id
  end

  test "CORS preflight from the dev web app is allowed", %{conn: conn} do
    conn =
      conn
      |> put_req_header("origin", "http://localhost:4000")
      |> put_req_header("access-control-request-method", "PUT")
      |> put_req_header("access-control-request-headers", "authorization,content-type")
      |> options("/api/v1/auth/me")

    assert conn.status in [200, 204]
    assert get_resp_header(conn, "access-control-allow-origin") == ["http://localhost:4000"]
  end

  test "CORS does not answer an unknown origin", %{conn: conn} do
    conn =
      conn
      |> put_req_header("origin", "https://evil.example")
      |> get("/api/v1/health")

    assert get_resp_header(conn, "access-control-allow-origin") == []
  end

  test "an unknown route is a JSON 404", %{conn: conn} do
    assert conn |> get("/api/v1/nope") |> json_response(404) ==
             %{"error" => "not_found", "message" => "Resource not found"}
  end
end
