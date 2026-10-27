defmodule StabileoAuth.Controllers.Admin.SettingsControllerTest do
  use StabileoAuth.ConnCase, async: false

  @moduletag user_login: false

  setup do
    admin = Factory.insert(:admin)
    %{token: admin_log_in(admin).access_token}
  end

  defp settings(overrides \\ %{}) do
    Map.merge(
      %{
        "user_login_enabled" => false,
        "usage_telemetry_enabled" => false,
        "cloud_projects_enabled" => false,
        "terms_version" => StabileoAuth.Consents.terms_version()
      },
      overrides
    )
  end

  test "every flag starts off", %{token: token} do
    assert admin_request(:get, "/settings", %{}, token) |> json_body(200) == %{
             "data" => settings()
           }
  end

  test "turning user sign-in on and off is live for the product API", %{token: token} do
    signup = %{
      "email" => "late@example.org",
      "password" => "long-enough",
      "name" => "Late",
      "accept_terms" => true
    }

    assert request(:post, "/register", signup) |> json_body(403) |> Map.get("error") ==
             "user_login_disabled"

    assert admin_request(:put, "/settings", %{"user_login_enabled" => true}, token)
           |> json_body(200) ==
             %{"data" => settings(%{"user_login_enabled" => true})}

    assert request(:get, "/config") |> json_body(200) |> Map.get("user_login_enabled") == true
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

  test "sets several flags at once and records the change", %{token: token} do
    body =
      admin_request(
        :put,
        "/settings",
        %{"usage_telemetry_enabled" => true, "cloud_projects_enabled" => true},
        token
      )
      |> json_body(200)

    assert body["data"] ==
             settings(%{"usage_telemetry_enabled" => true, "cloud_projects_enabled" => true})

    assert StabileoRepo.Features.usage_telemetry_enabled?()
    assert StabileoRepo.Features.cloud_projects_enabled?()

    assert [audit] = Repo.all(StabileoRepo.Schemas.AdminAction)
    assert audit.action == "settings.update"
    assert audit.details == %{"usage_telemetry_enabled" => true, "cloud_projects_enabled" => true}
  end

  test "422 and nothing written when one of several flags is not a boolean", %{token: token} do
    body =
      admin_request(
        :put,
        "/settings",
        %{"usage_telemetry_enabled" => true, "cloud_projects_enabled" => 1},
        token
      )
      |> json_body(422)

    assert body["details"] == %{"cloud_projects_enabled" => ["must be true or false"]}
    refute StabileoRepo.Features.usage_telemetry_enabled?()
  end

  test "422 when no known flag is given", %{token: token} do
    body = admin_request(:put, "/settings", %{"other" => true}, token) |> json_body(422)
    assert body["error"] == "validation_error"
    assert body["details"]["user_login_enabled"] == ["must be true or false"]
  end

  test "401 without an admin token" do
    assert admin_request(:get, "/settings") |> json_body(401)
    assert admin_request(:put, "/settings", %{"user_login_enabled" => true}) |> json_body(401)
  end
end
