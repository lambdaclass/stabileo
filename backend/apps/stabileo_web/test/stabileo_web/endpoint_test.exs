defmodule StabileoWeb.EndpointTest do
  use StabileoWeb.ConnCase, async: true

  test "a JSON sign-up goes through the endpoint, records consent and authenticates", %{
    conn: conn
  } do
    {:ok, _} = StabileoRepo.Features.set_user_login_enabled(true)
    verifier = "endpoint-signup-verifier"
    email = "endpoint@gmail.com"

    {:ok, code} =
      StabileoAuth.UserOAuth.sign_in(
        %{"sub" => "endpoint-signup", "email" => email, "email_verified" => true, "name" => "E"},
        StabileoAuth.UserOAuth.challenge(verifier)
      )

    signup =
      conn
      |> put_req_header("content-type", "application/json")
      |> post("/api/v1/auth/google/exchange", Jason.encode!(%{code: code, verifier: verifier}))
      |> json_response(200)

    assert signup["signup_required"] == true
    assert StabileoAuth.Accounts.get_account_by_email(email) == nil

    for consent <- [%{}, %{accept_terms: false}, %{accept_terms: "true"}] do
      refused =
        build_conn()
        |> put_req_header("content-type", "application/json")
        |> post(
          "/api/v1/auth/google/register",
          Jason.encode!(Map.put(consent, :signup_token, signup["signup_token"]))
        )
        |> json_response(422)

      assert refused["details"] == %{"accept_terms" => ["must be accepted"]}
      assert StabileoAuth.Accounts.get_account_by_email(email) == nil
    end

    body =
      build_conn()
      |> put_req_header("content-type", "application/json")
      |> post(
        "/api/v1/auth/google/register",
        Jason.encode!(%{
          signup_token: signup["signup_token"],
          accept_terms: true,
          usage_analytics: true,
          model_research: false
        })
      )
      |> json_response(201)

    assert body["account"]["email"] == email
    assert body["account"]["sign_in_method"] == "google"
    assert is_binary(body["refresh_token"])
    account = StabileoAuth.Accounts.get_account_by_email(email)
    assert account.id == body["account"]["id"]
    consents = StabileoAuth.Consents.current(account)
    assert StabileoAuth.Consents.terms_current?(consents)
    assert consents.usage_analytics == true
    assert consents.model_research == false

    me =
      build_conn()
      |> put_req_header("authorization", "Bearer " <> body["access_token"])
      |> get("/api/v1/auth/me")
      |> json_response(200)

    assert me["data"]["id"] == body["account"]["id"]
    assert me["data"]["consents"]["terms_current"] == true
  end

  test "a JSON refresh goes through the endpoint into the auth router", %{conn: conn} do
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
