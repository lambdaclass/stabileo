defmodule StabileoAuth.Controllers.AuthControllerTest do
  use StabileoAuth.ConnCase, async: true

  @tag user_login: false
  test "GET /config reports the switches and Google as the way in" do
    assert request(:get, "/config") |> json_body(200) == %{
             "user_login_enabled" => false,
             "terms_version" => StabileoAuth.Consents.terms_version(),
             "usage_telemetry_enabled" => false,
             "cloud_projects_enabled" => false,
             "save_requires_account" => false,
             "assignments_enabled" => false,
             "google_login" => true
           }
  end

  describe "POST /refresh" do
    test "rotates: new pair works, the old refresh and access tokens stop working" do
      session = log_in(Factory.insert(:account))

      body =
        request(:post, "/refresh", %{"refresh_token" => session.refresh_token}) |> json_body(200)

      assert body["refresh_token"] != session.refresh_token
      assert body["account"]["id"] == session.account.id

      reused =
        request(:post, "/refresh", %{"refresh_token" => session.refresh_token}) |> json_body(401)

      assert reused["error"] == "refresh_failed"

      assert request(:get, "/me", %{}, body["access_token"]) |> json_body(200)
      assert request(:get, "/me", %{}, session.access_token) |> json_body(401)
    end

    test "401 for garbage, an access token, or nothing" do
      session = log_in(Factory.insert(:account))

      for params <- [
            %{"refresh_token" => "garbage"},
            %{"refresh_token" => session.access_token},
            %{}
          ] do
        assert request(:post, "/refresh", params) |> json_body(401) |> Map.get("error") ==
                 "refresh_failed"
      end
    end

    test "401 once the account is disabled" do
      account = Factory.insert(:account)
      session = log_in(account)
      account |> Ecto.Changeset.change(is_active: false) |> Repo.update!()

      assert request(:post, "/refresh", %{"refresh_token" => session.refresh_token})
             |> json_body(401)
    end
  end

  describe "DELETE /logout" do
    test "revokes the session behind the refresh token, and its access token" do
      session = log_in(Factory.insert(:account))

      assert request(:delete, "/logout", %{"refresh_token" => session.refresh_token})
             |> json_body(200)

      assert request(:post, "/refresh", %{"refresh_token" => session.refresh_token})
             |> json_body(401)

      assert request(:get, "/me", %{}, session.access_token) |> json_body(401)
    end

    test "answers 200 even without a valid token" do
      assert request(:delete, "/logout", %{"refresh_token" => "garbage"}) |> json_body(200)
      assert request(:delete, "/logout", %{}) |> json_body(200)
    end
  end
end
