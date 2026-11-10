defmodule StabileoAuth.Controllers.GoogleControllerTest do
  use StabileoAuth.ConnCase, async: false

  alias StabileoAuth.GoogleStrategyStub
  alias StabileoRepo.Schemas.Account

  @router StabileoAuth.Router
  @verifier "this-browser-attempt-secret-0123456789abcdef"
  @attempt StabileoAuth.UserOAuth.challenge(@verifier)
  @in_flight %{user_oauth_session_params: %{state: "stub-state"}, user_oauth_attempt: @attempt}

  defp get_with_session(path, params, session) do
    :get
    |> Plug.Test.conn(path, params)
    |> Plug.Test.init_test_session(session)
    |> @router.call(@router.init([]))
  end

  defp redirect_query(conn) do
    assert conn.status == 302
    [location] = get_resp_header(conn, "location")
    uri = URI.parse(location)

    assert "#{uri.scheme}://#{uri.authority}#{uri.path}" ==
             "http://localhost:4000/oauth-callback.html"

    URI.decode_query(uri.query || "")
  end

  defp callback_code do
    conn =
      get_with_session(
        "/google/callback",
        %{"state" => "stub-state", "code" => "abc"},
        @in_flight
      )

    assert get_session(conn, :user_oauth_session_params) == nil
    assert get_session(conn, :user_oauth_attempt) == nil
    %{"code" => code, "attempt" => @attempt} = redirect_query(conn)
    code
  end

  defp put_env(key, value) do
    previous = Application.get_env(:stabileo_auth, key)
    Application.put_env(:stabileo_auth, key, value)
    on_exit(fn -> Application.put_env(:stabileo_auth, key, previous) end)
  end

  setup do
    GoogleStrategyStub.put_user(%{
      "email" => "someone@gmail.com",
      "email_verified" => true,
      "name" => "Someone",
      "sub" => "g-someone"
    })

    on_exit(fn -> GoogleStrategyStub.put_user(nil) end)
    :ok
  end

  test "GET /google redirects to Google with the product's callback and keeps the state and the attempt" do
    conn = get_with_session("/google", %{"attempt" => @attempt}, %{})

    assert conn.status == 302
    [location] = get_resp_header(conn, "location")
    assert location =~ "https://accounts.google.test/"
    assert location =~ "client_id=test-google-app-client-id"
    refute location =~ @attempt
    assert get_session(conn, :user_oauth_session_params) == %{state: "stub-state"}
    assert get_session(conn, :user_oauth_attempt) == @attempt
  end

  test "GET /google without an attempt is invalid_state and goes nowhere near Google" do
    for params <- [%{}, %{"attempt" => "short"}] do
      conn = get_with_session("/google", params, %{})
      assert redirect_query(conn) == %{"error" => "invalid_state"}
      assert get_session(conn, :user_oauth_session_params) == nil
    end
  end

  test "a code traded with another attempt's verifier is 401 and still works for its own" do
    Factory.insert(:account, email: "someone@gmail.com")
    code = callback_code()

    assert request(:post, "/google/exchange", %{
             "code" => code,
             "verifier" => "another-tab-or-browser-secret-0123456789ab"
           })
           |> json_body(401)
           |> Map.get("error") == "invalid_or_expired_code"

    assert request(:post, "/google/exchange", %{"code" => code}) |> json_body(401)

    body =
      request(:post, "/google/exchange", %{"code" => code, "verifier" => @verifier})
      |> json_body(200)

    assert body["account"]["email"] == "someone@gmail.com"
  end

  test "an account on an address Google does not answer for is email_in_use" do
    Factory.insert(:account, email: "eng@studio.example")

    GoogleStrategyStub.put_user(%{
      "email" => "eng@studio.example",
      "email_verified" => true,
      "sub" => "g-studio"
    })

    conn =
      get_with_session(
        "/google/callback",
        %{"state" => "stub-state", "code" => "abc"},
        @in_flight
      )

    assert %{"error" => "email_in_use", "attempt" => @attempt} = redirect_query(conn)
  end

  test "GET /google says unavailable without the product's own Google client" do
    oauth = Application.get_env(:stabileo_auth, :google_oauth)
    put_env(:google_oauth, Keyword.merge(oauth, app_client_id: "", app_client_secret: ""))

    assert %{"error" => "oauth_unavailable", "attempt" => @attempt} =
             redirect_query(get_with_session("/google", %{"attempt" => @attempt}, %{}))
  end

  test "someone new: callback, exchange, then register with the terms" do
    body =
      request(:post, "/google/exchange", %{"code" => callback_code(), "verifier" => @verifier})
      |> json_body(200)

    assert body["signup_required"] == true
    assert body["email"] == "someone@gmail.com"
    assert body["name"] == "Someone"
    assert Repo.get_by(Account, email: "someone@gmail.com") == nil

    refused =
      request(:post, "/google/register", %{"signup_token" => body["signup_token"]})
      |> json_body(422)

    assert refused["error"] == "validation_error"
    assert refused["details"] == %{"accept_terms" => ["must be accepted"]}

    created =
      request(:post, "/google/register", %{
        "signup_token" => body["signup_token"],
        "accept_terms" => true,
        "locale" => "pt"
      })
      |> json_body(201)

    assert Map.keys(created) |> Enum.sort() ==
             ~w(access_token account expires_in refresh_token)

    assert created["account"]["email"] == "someone@gmail.com"
    assert created["account"]["locale"] == "pt"
    assert created["account"]["sign_in_method"] == "google"
    assert created["account"]["consents"]["terms_current"] == true
    assert request(:get, "/me", %{}, created["access_token"]) |> json_body(200)

    saved = Repo.get_by!(Account, email: "someone@gmail.com")
    assert saved.google_subject == "g-someone"
    assert saved.password_hash == nil
  end

  test "a known person: the exchange answers the session" do
    Factory.insert(:account, email: "someone@gmail.com")

    body =
      request(:post, "/google/exchange", %{"code" => callback_code(), "verifier" => @verifier})
      |> json_body(200)

    assert body["account"]["email"] == "someone@gmail.com"
    assert is_binary(body["access_token"])
    refute Map.has_key?(body, "signup_required")
  end

  test "exchange and register refuse a bad code with 401" do
    for {path, params} <- [
          {"/google/exchange", %{"code" => "forged"}},
          {"/google/register", %{"signup_token" => "forged", "accept_terms" => true}}
        ] do
      assert request(:post, path, params) |> json_body(401) |> Map.get("error") ==
               "invalid_or_expired_code"
    end
  end

  test "callback without the session state or the attempt is invalid_state" do
    conn = get_with_session("/google/callback", %{"state" => "stub-state", "code" => "abc"}, %{})
    assert redirect_query(conn) == %{"error" => "invalid_state"}

    conn =
      get_with_session("/google/callback", %{"state" => "stub-state", "code" => "abc"}, %{
        user_oauth_session_params: %{state: "stub-state"}
      })

    assert redirect_query(conn) == %{"error" => "invalid_state"}
  end

  test "callback when Google answers an error is provider_error" do
    conn =
      get_with_session("/google/callback", %{"error" => "access_denied"}, @in_flight)

    assert %{"error" => "provider_error"} = redirect_query(conn)
  end

  test "callback with an unverified email is email_not_verified" do
    GoogleStrategyStub.put_user(%{
      "email" => "someone@gmail.com",
      "email_verified" => false,
      "sub" => "g-someone"
    })

    conn =
      get_with_session(
        "/google/callback",
        %{"state" => "stub-state", "code" => "abc"},
        @in_flight
      )

    assert %{"error" => "email_not_verified"} = redirect_query(conn)
  end

  @tag user_login: false
  test "while user sign-in is off the callback and register say so" do
    conn =
      get_with_session(
        "/google/callback",
        %{"state" => "stub-state", "code" => "abc"},
        @in_flight
      )

    assert %{"error" => "user_login_disabled"} = redirect_query(conn)

    assert request(:post, "/google/register", %{"signup_token" => "x", "accept_terms" => true})
           |> json_body(403)
           |> Map.get("error") == "user_login_disabled"
  end

  test "the local stand-in page is not served unless development turned it on" do
    conn = get_with_session("/google/dev", %{"state" => "s", "redirect_uri" => "http://x"}, %{})
    assert json_body(conn, 404)["error"] == "not_found"
  end

  test "GET /config reports Google as the only sign-in, and the password routes are gone" do
    body = request(:get, "/config") |> json_body(200)
    assert body["google_login"] == true
    refute Map.has_key?(body, "password_login")

    for path <- ["/register", "/login"] do
      assert_raise Phoenix.Router.NoRouteError, fn ->
        request(:post, path, %{"email" => "pw@example.org", "password" => "long-enough"})
      end
    end
  end
end
