defmodule StabileoAuth.Controllers.Admin.SettingsControllerTest do
  use StabileoAuth.ConnCase, async: false

  @moduletag user_login: false

  setup do
    admin = Factory.insert(:admin)
    %{token: admin_log_in(admin).access_token}
  end

  test "user sign-in starts off", %{token: token} do
    assert admin_request(:get, "/settings", %{}, token) |> json_body(200) ==
             %{"data" => %{"user_login_enabled" => false}}
  end

  test "turning user sign-in on and off is live for the product API", %{token: token} do
    signup = %{"email" => "late@example.org", "password" => "long-enough", "name" => "Late"}

    assert request(:post, "/register", signup) |> json_body(403) |> Map.get("error") ==
             "user_login_disabled"

    assert admin_request(:put, "/settings", %{"user_login_enabled" => true}, token)
           |> json_body(200) ==
             %{"data" => %{"user_login_enabled" => true}}

    assert request(:get, "/config") |> json_body(200) == %{"user_login_enabled" => true}
    session = request(:post, "/register", signup) |> json_body(201)

    assert admin_request(:put, "/settings", %{"user_login_enabled" => false}, token)
           |> json_body(200)

    assert request(:post, "/login", %{"email" => "late@example.org", "password" => "long-enough"})
           |> json_body(403)
           |> Map.get("error") == "user_login_disabled"

    assert request(:get, "/me", %{}, session["access_token"]) |> json_body(200)

    assert request(:post, "/refresh", %{"refresh_token" => session["refresh_token"]})
           |> json_body(200)
  end

  test "422 for a value that is not a boolean", %{token: token} do
    body =
      admin_request(:put, "/settings", %{"user_login_enabled" => "yes"}, token) |> json_body(422)

    assert body["details"]["user_login_enabled"] == ["must be true or false"]
  end

  test "401 without an admin token" do
    assert admin_request(:get, "/settings") |> json_body(401)
    assert admin_request(:put, "/settings", %{"user_login_enabled" => true}) |> json_body(401)
  end
end
