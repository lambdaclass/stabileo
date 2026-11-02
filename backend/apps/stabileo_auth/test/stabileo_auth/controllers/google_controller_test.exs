defmodule StabileoAuth.Controllers.GoogleControllerTest do
  use StabileoAuth.ConnCase, async: false

  alias StabileoAuth.GoogleStrategyStub
  alias StabileoRepo.Schemas.Account

  @router StabileoAuth.Router

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

    assert "#{uri.scheme}://#{uri.authority}#{uri.path}" ==
             "http://localhost:4000/oauth-callback.html"

    URI.decode_query(uri.query || "")
  end

  defp callback_code do
    conn =
      get_with_session("/google/callback", %{"state" => "stub-state", "code" => "abc"}, %{
        user_oauth_session_params: %{state: "stub-state"}
      })

    assert get_session(conn, :user_oauth_session_params) == nil
    %{"code" => code} = redirect_query(conn)
    code
  end

  defp put_env(key, value) do
    previous = Application.get_env(:stabileo_auth, key)
    Application.put_env(:stabileo_auth, key, value)
    on_exit(fn -> Application.put_env(:stabileo_auth, key, previous) end)
  end

  setup do
    GoogleStrategyStub.put_user(%{
      "email" => "someone@gmail.test",
      "email_verified" => true,
      "name" => "Someone",
      "sub" => "g-someone"
    })

    on_exit(fn -> GoogleStrategyStub.put_user(nil) end)
    :ok
  end

  test "GET /google redirects to Google with the product's callback and keeps the state" do
    conn = get_with_session("/google", %{})

    assert conn.status == 302
    [location] = get_resp_header(conn, "location")
    assert location =~ "https://accounts.google.test/"
    assert get_session(conn, :user_oauth_session_params) == %{state: "stub-state"}
  end

  test "GET /google says unavailable when Google is not configured" do
    put_env(:google_oauth, client_id: "", client_secret: "")

    assert %{"error" => "oauth_unavailable"} = redirect_query(get_with_session("/google", %{}))
  end

  test "someone new: callback, exchange, then register with the terms" do
    body = request(:post, "/google/exchange", %{"code" => callback_code()}) |> json_body(200)

    assert body["signup_required"] == true
    assert body["email"] == "someone@gmail.test"
    assert body["name"] == "Someone"
    assert Repo.get_by(Account, email: "someone@gmail.test") == nil

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

    assert created["account"]["email"] == "someone@gmail.test"
    assert created["account"]["locale"] == "pt"
    assert created["account"]["sign_in_method"] == "google"
    assert created["account"]["consents"]["terms_current"] == true
    assert request(:get, "/me", %{}, created["access_token"]) |> json_body(200)

    saved = Repo.get_by!(Account, email: "someone@gmail.test")
    assert saved.google_subject == "g-someone"
    assert saved.password_hash == nil
  end

  test "a known person: the exchange answers the session" do
    Factory.insert(:account, email: "someone@gmail.test")

    body = request(:post, "/google/exchange", %{"code" => callback_code()}) |> json_body(200)

    assert body["account"]["email"] == "someone@gmail.test"
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

  test "callback without the session state is invalid_state" do
    conn = get_with_session("/google/callback", %{"state" => "stub-state", "code" => "abc"}, %{})
    assert %{"error" => "invalid_state"} = redirect_query(conn)
  end

  test "callback when Google answers an error is provider_error" do
    conn =
      get_with_session("/google/callback", %{"error" => "access_denied"}, %{
        user_oauth_session_params: %{state: "stub-state"}
      })

    assert %{"error" => "provider_error"} = redirect_query(conn)
  end

  test "callback with an unverified email is email_not_verified" do
    GoogleStrategyStub.put_user(%{
      "email" => "someone@gmail.test",
      "email_verified" => false,
      "sub" => "g-someone"
    })

    conn =
      get_with_session("/google/callback", %{"state" => "stub-state", "code" => "abc"}, %{
        user_oauth_session_params: %{state: "stub-state"}
      })

    assert %{"error" => "email_not_verified"} = redirect_query(conn)
  end

  @tag user_login: false
  test "while user sign-in is off the callback and register say so" do
    conn =
      get_with_session("/google/callback", %{"state" => "stub-state", "code" => "abc"}, %{
        user_oauth_session_params: %{state: "stub-state"}
      })

    assert %{"error" => "user_login_disabled"} = redirect_query(conn)

    assert request(:post, "/google/register", %{"signup_token" => "x", "accept_terms" => true})
           |> json_body(403)
           |> Map.get("error") == "user_login_disabled"
  end

  test "the local stand-in page is not served unless development turned it on" do
    conn = get_with_session("/google/dev", %{"state" => "s", "redirect_uri" => "http://x"}, %{})
    assert json_body(conn, 404)["error"] == "not_found"
  end

  describe "password sign-in turned off" do
    setup do
      put_env(:user_password_login, false)
      :ok
    end

    test "GET /config reports Google only" do
      body = request(:get, "/config") |> json_body(200)
      assert body["google_login"] == true
      assert body["password_login"] == false
    end

    test "register, login and password change answer 403 password_login_disabled" do
      account = Factory.insert(:account)
      before = Repo.aggregate(Account, :count)

      for {path, params} <- [
            {"/register",
             %{
               "email" => "pw@example.org",
               "password" => "long-enough",
               "name" => "P",
               "accept_terms" => true
             }},
            {"/login", %{"email" => account.email, "password" => Factory.password()}}
          ] do
        assert request(:post, path, params) |> json_body(403) |> Map.get("error") ==
                 "password_login_disabled"
      end

      assert Repo.aggregate(Account, :count) == before

      put_env(:user_password_login, true)
      %{access_token: token} = log_in(account)
      put_env(:user_password_login, false)

      assert request(
               :put,
               "/password",
               %{"current_password" => Factory.password(), "password" => "another-long-one"},
               token
             )
             |> json_body(403)
             |> Map.get("error") == "password_login_disabled"
    end
  end
end
