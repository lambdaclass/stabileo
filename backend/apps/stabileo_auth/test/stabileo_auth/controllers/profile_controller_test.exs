defmodule StabileoAuth.Controllers.ProfileControllerTest do
  use StabileoAuth.ConnCase, async: true

  alias StabileoRepo.Schemas.Account

  setup do
    account = Factory.insert(:account, name: "Profile User")
    %{account: account, token: log_in(account).access_token}
  end

  describe "GET /me" do
    test "answers the current account", %{account: account, token: token} do
      body = request(:get, "/me", %{}, token) |> json_body(200)

      assert body["data"]["id"] == account.id
      assert body["data"]["email"] == account.email
      assert body["data"]["name"] == "Profile User"
      assert body["data"]["locale"] == "es"

      assert Enum.sort(Map.keys(body["data"])) ==
               ~w(company country email email_verified_at id inserted_at job_title locale name)
    end

    test "401 missing_token without a token" do
      body = request(:get, "/me") |> json_body(401)
      assert body["error"] == "missing_token"
    end

    test "401 invalid_token with a bad token" do
      assert request(:get, "/me", %{}, "not-a-jwt") |> json_body(401) |> Map.get("error") ==
               "invalid_token"
    end

    test "401 invalid_token with a refresh token", %{account: account} do
      refresh = log_in(account).refresh_token

      assert request(:get, "/me", %{}, refresh) |> json_body(401) |> Map.get("error") ==
               "invalid_token"
    end

    test "401 account_disabled once the account is disabled", %{account: account, token: token} do
      account |> Ecto.Changeset.change(is_active: false) |> Repo.update!()

      assert request(:get, "/me", %{}, token) |> json_body(401) |> Map.get("error") ==
               "account_disabled"
    end
  end

  describe "PUT /me" do
    test "updates the profile and ignores the email", %{account: account, token: token} do
      params = %{
        "name" => "Ada Lovelace",
        "company" => "Analytical Engines",
        "job_title" => "Structural engineer",
        "country" => "ar",
        "locale" => "en",
        "email" => "hijack@example.com"
      }

      body = request(:put, "/me", params, token) |> json_body(200)

      assert body["data"]["name"] == "Ada Lovelace"
      assert body["data"]["country"] == "AR"
      assert body["data"]["email"] == account.email

      saved = Repo.get!(Account, account.id)
      assert saved.company == "Analytical Engines"
      assert saved.job_title == "Structural engineer"
      assert saved.locale == "en"
      assert saved.email == account.email
    end

    test "422 with the failing fields and nothing saved", %{account: account, token: token} do
      body =
        request(:put, "/me", %{"name" => "", "country" => "ARG", "locale" => "xx"}, token)
        |> json_body(422)

      assert body["error"] == "validation_error"
      assert body["details"]["name"] == ["can't be blank"]
      assert body["details"]["country"] == ["must be a two-letter ISO code"]
      assert body["details"]["locale"] == ["is invalid"]
      assert Repo.get!(Account, account.id).name == "Profile User"
    end

    test "401 without a token" do
      assert request(:put, "/me", %{"name" => "X"}) |> json_body(401)
    end
  end
end
