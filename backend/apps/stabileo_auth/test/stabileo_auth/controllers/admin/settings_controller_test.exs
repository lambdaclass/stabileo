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
        "save_requires_account" => false,
        "cloud_projects_limit" => 1,
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
    assert {:error, :user_login_disabled} = google_sign_in("late@gmail.com", "g-late")

    assert admin_request(:put, "/settings", %{"user_login_enabled" => true}, token)
           |> json_body(200) ==
             %{"data" => settings(%{"user_login_enabled" => true})}

    assert request(:get, "/config") |> json_body(200) |> Map.get("user_login_enabled") == true
    assert {:ok, _code} = google_sign_in("late@gmail.com", "g-late")
    session = log_in(Factory.insert(:account))

    assert admin_request(:put, "/settings", %{"user_login_enabled" => false}, token)
           |> json_body(200)

    assert {:error, :user_login_disabled} = google_sign_in("late@gmail.com", "g-late")
    assert request(:get, "/me", %{}, session.access_token) |> json_body(200)

    assert request(:post, "/refresh", %{"refresh_token" => session.refresh_token})
           |> json_body(200)
  end

  defp google_sign_in(email, subject) do
    StabileoAuth.UserOAuth.sign_in(
      %{"email" => email, "email_verified" => true, "sub" => subject, "name" => "G"},
      StabileoAuth.UserOAuth.challenge("a-browser-attempt-secret-0123456789abcdef")
    )
  end

  test "422 for a value that is not a boolean", %{token: token} do
    body =
      admin_request(:put, "/settings", %{"user_login_enabled" => "yes"}, token) |> json_body(422)

    assert body["details"]["user_login_enabled"] == ["must be true or false"]
  end

  test "422 naming every setting, the limit included, when the body has none", %{token: token} do
    body = admin_request(:put, "/settings", %{"unknown" => true}, token) |> json_body(422)

    assert body["details"]["user_login_enabled"] == ["must be true or false"]
    assert [limit] = body["details"]["cloud_projects_limit"]
    assert limit =~ "whole number"
  end

  test "sets several flags at once and records the change", %{token: token} do
    body =
      admin_request(
        :put,
        "/settings",
        %{
          "usage_telemetry_enabled" => true,
          "cloud_projects_enabled" => true,
          "save_requires_account" => true
        },
        token
      )
      |> json_body(200)

    assert body["data"] ==
             settings(%{
               "usage_telemetry_enabled" => true,
               "cloud_projects_enabled" => true,
               "save_requires_account" => true
             })

    assert StabileoRepo.Features.usage_telemetry_enabled?()
    assert StabileoRepo.Features.cloud_projects_enabled?()
    assert StabileoRepo.Features.save_requires_account?()

    assert request(:get, "/config") |> json_body(200) |> Map.get("save_requires_account") == true

    assert [audit] = Repo.all(StabileoRepo.Schemas.AdminAction)
    assert audit.action == "settings.update"

    assert audit.details == %{
             "usage_telemetry_enabled" => true,
             "cloud_projects_enabled" => true,
             "save_requires_account" => true
           }
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

  test "sets how many cloud projects an account may keep", %{token: token} do
    body =
      admin_request(:put, "/settings", %{"cloud_projects_limit" => 3}, token) |> json_body(200)

    assert body["data"]["cloud_projects_limit"] == 3
    assert StabileoRepo.Features.cloud_projects_limit() == 3
    assert [audit] = Repo.all(StabileoRepo.Schemas.AdminAction)
    assert audit.details == %{"cloud_projects_limit" => 3}
  end

  test "422 for a project limit outside 1 to 100", %{token: token} do
    for value <- [0, 101, 1.5, "2", true] do
      body =
        admin_request(:put, "/settings", %{"cloud_projects_limit" => value}, token)
        |> json_body(422)

      assert body["details"]["cloud_projects_limit"] == ["must be a whole number from 1 to 100"]
    end

    assert StabileoRepo.Features.cloud_projects_limit() == 1
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
