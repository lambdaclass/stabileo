defmodule StabileoAuth.Controllers.AuthControllerTest do
  use StabileoAuth.ConnCase, async: true

  import Ecto.Query

  alias StabileoRepo.Schemas.{Account, Session}

  @account_keys ~w(id email name company job_title country locale email_verified_at inserted_at consents)

  describe "user sign-in turned off" do
    @describetag user_login: false

    test "GET /config reports it" do
      assert request(:get, "/config") |> json_body(200) == %{
               "user_login_enabled" => false,
               "terms_version" => StabileoAuth.Consents.terms_version(),
               "usage_telemetry_enabled" => false,
               "cloud_projects_enabled" => false,
               "save_requires_account" => false
             }
    end

    test "register and login answer 403 user_login_disabled and write nothing" do
      account = Factory.insert(:account)
      before = Repo.aggregate(Account, :count)

      for {path, params} <- [
            {"/register",
             %{"email" => "closed@example.org", "password" => "long-enough", "name" => "C"}},
            {"/login", %{"email" => account.email, "password" => Factory.password()}}
          ] do
        assert request(:post, path, params) |> json_body(403) |> Map.get("error") ==
                 "user_login_disabled"
      end

      assert Repo.aggregate(Account, :count) == before
      assert Repo.aggregate(from(s in Session, where: s.account_id == ^account.id), :count) == 0
    end
  end

  describe "POST /register" do
    test "creates the account and answers a session" do
      conn =
        request(:post, "/register", %{
          "email" => "New@Example.com",
          "password" => "long-enough",
          "name" => "New User",
          "locale" => "en",
          "accept_terms" => true
        })

      body = json_body(conn, 201)
      assert is_binary(body["access_token"])
      assert is_binary(body["refresh_token"])
      assert body["expires_in"] == 900
      assert Enum.sort(Map.keys(body["account"])) == Enum.sort(@account_keys)
      assert body["account"]["email"] == "new@example.com"
      assert body["account"]["locale"] == "en"

      saved = Repo.get!(Account, body["account"]["id"])
      assert saved.name == "New User"
      assert %DateTime{} = saved.last_sign_in_at
      assert Repo.get_by!(Session, account_id: saved.id).user_agent == "conn-case"
    end

    test "ignores fields a sign-up cannot set" do
      conn =
        request(:post, "/register", %{
          "email" => "sneaky@example.com",
          "password" => "long-enough",
          "name" => "Sneaky",
          "is_active" => false,
          "email_verified_at" => "2026-01-01T00:00:00Z",
          "accept_terms" => true
        })

      body = json_body(conn, 201)
      saved = Repo.get!(Account, body["account"]["id"])
      assert saved.is_active == true
      assert saved.email_verified_at == nil
    end

    test "422 with every failing field" do
      before = Repo.aggregate(Account, :count)

      body =
        request(:post, "/register", %{"email" => "bad", "password" => "short"}) |> json_body(422)

      assert body["error"] == "validation_error"
      assert body["details"]["email"] == ["must have @ sign and no spaces"]
      assert body["details"]["password"] == ["should be at least 8 character(s)"]
      assert body["details"]["name"] == ["can't be blank"]
      assert body["details"]["accept_terms"] == ["must be accepted"]
      assert Repo.aggregate(Account, :count) == before
    end

    test "422 accept_terms, and nothing written, when the terms are not accepted" do
      before = Repo.aggregate(Account, :count)

      for accept <- [nil, false, "true"] do
        params =
          %{"email" => "no-terms@example.com", "password" => "long-enough", "name" => "No Terms"}
          |> then(&if(accept == nil, do: &1, else: Map.put(&1, "accept_terms", accept)))

        body = request(:post, "/register", params) |> json_body(422)
        assert body["error"] == "validation_error"
        assert body["details"] == %{"accept_terms" => ["must be accepted"]}
      end

      assert Repo.aggregate(Account, :count) == before
      assert Repo.aggregate(StabileoRepo.Schemas.Consent, :count) == 0
    end

    test "records the terms accepted and the optional consents given" do
      body =
        request(:post, "/register", %{
          "email" => "consents@example.com",
          "password" => "long-enough",
          "name" => "Consents",
          "accept_terms" => true,
          "usage_analytics" => true,
          "model_research" => false
        })
        |> json_body(201)

      version = StabileoAuth.Consents.terms_version()

      assert %{
               "terms" => %{"version" => ^version},
               "terms_current" => true,
               "usage_analytics" => true,
               "model_research" => false
             } = body["account"]["consents"]

      rows =
        from(c in StabileoRepo.Schemas.Consent,
          where: c.account_id == ^body["account"]["id"],
          order_by: c.kind
        )
        |> Repo.all()

      assert Enum.map(rows, &{&1.kind, &1.granted}) ==
               [{"model_research", false}, {"terms", true}, {"usage_analytics", true}]

      assert Enum.all?(rows, &(&1.user_agent == "conn-case"))
    end

    test "422 for an email already registered" do
      existing = Factory.insert(:account)

      body =
        request(:post, "/register", %{
          "email" => String.upcase(existing.email),
          "password" => "long-enough",
          "name" => "Dup",
          "accept_terms" => true
        })
        |> json_body(422)

      assert body["details"]["email"] == ["has already been taken"]
    end
  end

  describe "POST /login" do
    setup do
      %{account: Factory.insert(:account)}
    end

    test "answers a session and records the sign-in", %{account: account} do
      body =
        request(:post, "/login", %{"email" => account.email, "password" => Factory.password()})
        |> json_body(200)

      assert body["account"]["id"] == account.id
      assert is_binary(body["access_token"])
      assert %DateTime{} = Repo.get!(Account, account.id).last_sign_in_at
    end

    test "401 invalid_credentials for a wrong password", %{account: account} do
      body =
        request(:post, "/login", %{"email" => account.email, "password" => "wrong-password"})
        |> json_body(401)

      assert body == %{"error" => "invalid_credentials", "message" => "Invalid email or password"}
    end

    test "401 invalid_credentials for an unknown email" do
      body =
        request(:post, "/login", %{"email" => "ghost@example.com", "password" => "whatever"})
        |> json_body(401)

      assert body["error"] == "invalid_credentials"
    end

    test "401 invalid_credentials when fields are missing" do
      assert request(:post, "/login", %{}) |> json_body(401) |> Map.get("error") ==
               "invalid_credentials"
    end

    test "403 account_disabled for a disabled account with the right password" do
      account = Factory.insert(:account, is_active: false)

      body =
        request(:post, "/login", %{"email" => account.email, "password" => Factory.password()})
        |> json_body(403)

      assert body["error"] == "account_disabled"
    end
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
