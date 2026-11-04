defmodule StabileoAuth.Controllers.Admin.AuthControllerTest do
  use StabileoAuth.ConnCase, async: false

  setup do
    %{admin: Factory.insert(:admin)}
  end

  describe "POST /auth/login" do
    test "answers an admin session", %{admin: admin} do
      body =
        admin_request(:post, "/auth/login", %{
          "email" => admin.email,
          "password" => Factory.password()
        })
        |> json_body(200)

      assert body["account"]["id"] == admin.id
      assert is_binary(body["access_token"])
      assert is_binary(body["refresh_token"])
      assert body["expires_in"] == 900
    end

    test "401 invalid_credentials for a valid non-admin account" do
      account = Factory.insert(:account)

      body =
        admin_request(:post, "/auth/login", %{
          "email" => account.email,
          "password" => Factory.password()
        })
        |> json_body(401)

      assert body["error"] == "invalid_credentials"
    end

    test "401 invalid_credentials without fields" do
      assert admin_request(:post, "/auth/login", %{}) |> json_body(401) |> Map.get("error") ==
               "invalid_credentials"
    end
  end

  describe "POST /auth/refresh and DELETE /auth/logout" do
    test "refresh rotates; logout revokes", %{admin: admin} do
      session = admin_log_in(admin)

      body =
        admin_request(:post, "/auth/refresh", %{"refresh_token" => session.refresh_token})
        |> json_body(200)

      assert admin_request(:delete, "/auth/logout", %{"refresh_token" => body["refresh_token"]})
             |> json_body(200)

      assert admin_request(:post, "/auth/refresh", %{"refresh_token" => body["refresh_token"]})
             |> json_body(401)
             |> Map.get("error") == "refresh_failed"
    end

    test "a product refresh token is refused", %{admin: admin} do
      product = log_in(admin)

      assert admin_request(:post, "/auth/refresh", %{"refresh_token" => product.refresh_token})
             |> json_body(401)
    end
  end

  describe "GET /auth/me" do
    test "answers the admin account", %{admin: admin} do
      token = admin_log_in(admin).access_token
      body = admin_request(:get, "/auth/me", %{}, token) |> json_body(200)
      assert body["data"]["email"] == "admin@example.com"
    end

    test "401 invalid_token with a product token, even for an admin account", %{admin: admin} do
      token = log_in(admin).access_token

      assert admin_request(:get, "/auth/me", %{}, token) |> json_body(401) |> Map.get("error") ==
               "invalid_token"
    end

    test "401 missing_token without a token" do
      assert admin_request(:get, "/auth/me") |> json_body(401) |> Map.get("error") ==
               "missing_token"
    end

    test "401 not_admin once the email leaves the allowlist", %{admin: admin} do
      token = admin_log_in(admin).access_token
      Repo.update_all(StabileoRepo.Schemas.AdminAllowedEmail, set: [is_active: false])

      assert admin_request(:get, "/auth/me", %{}, token) |> json_body(401) |> Map.get("error") ==
               "not_admin"
    end
  end

  test "an admin token is refused by the product API", %{admin: admin} do
    token = admin_log_in(admin).access_token

    assert request(:get, "/me", %{}, token) |> json_body(401) |> Map.get("error") ==
             "invalid_token"
  end
end
