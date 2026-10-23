defmodule StabileoAuth.Controllers.Admin.OAuthControllerTest do
  use StabileoAuth.ConnCase, async: false

  alias StabileoAuth.GoogleStrategyStub

  @router StabileoAuth.AdminRouter

  defp get_with_session(path, params \\ %{}, session) do
    :get
    |> Plug.Test.conn(path, params)
    |> Plug.Test.init_test_session(session)
    |> @router.call(@router.init([]))
  end

  defp redirect_query(conn) do
    assert conn.status == 302
    [location] = get_resp_header(conn, "location")
    uri = URI.parse(location)
    assert "#{uri.scheme}://#{uri.authority}#{uri.path}" == "http://localhost:4001/oauth/callback"
    URI.decode_query(uri.query || "")
  end

  setup do
    Factory.insert(:allowed_email, email: "staff@example.com")

    GoogleStrategyStub.put_user(%{
      "email" => "staff@example.com",
      "email_verified" => true,
      "hd" => "example.com",
      "name" => "Staff"
    })

    on_exit(fn -> GoogleStrategyStub.put_user(nil) end)
    :ok
  end

  test "GET /auth/google redirects to Google and keeps the state in the session" do
    conn = get_with_session("/auth/google", %{})

    assert conn.status == 302
    [location] = get_resp_header(conn, "location")
    assert location =~ "https://accounts.google.test/"
    assert get_session(conn, :admin_oauth_session_params) == %{state: "stub-state"}
  end

  test "GET /auth/google says unavailable when Google is not configured" do
    previous = Application.get_env(:stabileo_auth, :google_oauth)
    Application.put_env(:stabileo_auth, :google_oauth, client_id: "", client_secret: "")
    on_exit(fn -> Application.put_env(:stabileo_auth, :google_oauth, previous) end)

    assert %{"oauth_error" => "oauth_unavailable"} =
             redirect_query(get_with_session("/auth/google", %{}))
  end

  test "callback → code → exchange gives admin tokens, and the code works once" do
    conn =
      get_with_session("/auth/google/callback", %{"state" => "stub-state", "code" => "abc"}, %{
        admin_oauth_session_params: %{state: "stub-state"}
      })

    assert %{"code" => code} = redirect_query(conn)
    assert get_session(conn, :admin_oauth_session_params) == nil

    body = admin_request(:post, "/auth/oauth/exchange", %{"code" => code}) |> json_body(200)
    assert body["account"]["email"] == "staff@example.com"
    assert admin_request(:get, "/users", %{}, body["access_token"]) |> json_body(200)

    reused = admin_request(:post, "/auth/oauth/exchange", %{"code" => code}) |> json_body(401)
    assert reused["error"] == "invalid_or_expired_code"
  end

  test "callback without the session state is invalid_state" do
    conn =
      get_with_session("/auth/google/callback", %{"state" => "stub-state", "code" => "abc"}, %{})

    assert %{"oauth_error" => "invalid_state"} = redirect_query(conn)
  end

  test "callback with a forged state is callback_failed" do
    conn =
      get_with_session("/auth/google/callback", %{"state" => "forged", "code" => "abc"}, %{
        admin_oauth_session_params: %{state: "stub-state"}
      })

    assert %{"oauth_error" => "callback_failed"} = redirect_query(conn)
  end

  test "callback when the user cancelled at Google is provider_error" do
    conn =
      get_with_session("/auth/google/callback", %{"error" => "access_denied"}, %{
        admin_oauth_session_params: %{state: "stub-state"}
      })

    assert %{"oauth_error" => "provider_error"} = redirect_query(conn)
  end

  test "callback for a Google user outside the rules carries the reason, never a code" do
    cases = [
      {%{"email_verified" => false}, "email_not_verified"},
      {%{"hd" => nil}, "domain_not_allowed"},
      {%{"email" => "stranger@example.com"}, "email_not_allowed"}
    ]

    for {override, reason} <- cases do
      GoogleStrategyStub.put_user(
        Map.merge(
          %{"email" => "staff@example.com", "email_verified" => true, "hd" => "example.com"},
          override
        )
      )

      conn =
        get_with_session("/auth/google/callback", %{"state" => "stub-state", "code" => "abc"}, %{
          admin_oauth_session_params: %{state: "stub-state"}
        })

      query = redirect_query(conn)
      assert query["oauth_error"] == reason
      refute Map.has_key?(query, "code")
    end
  end

  test "GET /auth/config reports which sign-ins are available" do
    body = admin_request(:get, "/auth/config") |> json_body(200)
    assert body == %{"password_login" => true, "google_login" => true}
  end

  test "password sign-in is a 404 where it is turned off" do
    admin = Factory.insert(:admin)
    Application.put_env(:stabileo_auth, :admin_password_login, false)
    on_exit(fn -> Application.put_env(:stabileo_auth, :admin_password_login, true) end)

    assert admin_request(:post, "/auth/login", %{
             "email" => admin.email,
             "password" => Factory.password()
           })
           |> json_body(404)

    assert admin_request(:get, "/auth/config") |> json_body(200) |> Map.get("password_login") ==
             false
  end

  test "a product sign-up with an allowlisted email gets no admin access where only Google signs admins in" do
    Application.put_env(:stabileo_auth, :admin_password_login, false)
    on_exit(fn -> Application.put_env(:stabileo_auth, :admin_password_login, true) end)

    session =
      request(:post, "/register", %{
        "email" => "staff@example.com",
        "password" => "long-enough",
        "name" => "Squatter"
      })
      |> json_body(201)

    assert admin_request(:post, "/auth/login", %{
             "email" => "staff@example.com",
             "password" => "long-enough"
           })
           |> json_body(404)

    assert admin_request(:get, "/users", %{}, session["access_token"]) |> json_body(401)
  end
end
