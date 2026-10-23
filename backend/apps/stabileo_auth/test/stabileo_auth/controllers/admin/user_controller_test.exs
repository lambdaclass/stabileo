defmodule StabileoAuth.Controllers.Admin.UserControllerTest do
  use StabileoAuth.ConnCase, async: false

  alias StabileoRepo.Schemas.{Account, Session}

  import Ecto.Query

  @keys ~w(active_sessions company country email email_verified_at id inserted_at is_active is_admin job_title last_sign_in_at locale name)

  setup do
    admin = Factory.insert(:admin)
    %{admin: admin, token: admin_log_in(admin).access_token}
  end

  describe "GET /users" do
    test "lists with meta and the admin shape", %{token: token} do
      user = Factory.insert(:account, name: "Listed User", email: "listed-user@example.com")
      log_in(user)

      body = admin_request(:get, "/users", %{"search" => "listed-user"}, token) |> json_body(200)

      assert body["meta"] == %{"total" => 1, "limit" => 50, "offset" => 0}
      assert [row] = body["data"]
      assert Enum.sort(Map.keys(row)) == @keys
      assert row["id"] == user.id
      assert row["active_sessions"] == 1
      assert row["is_active"] == true
      assert row["is_admin"] == false
      assert is_binary(row["last_sign_in_at"])
    end

    test "filters, sorts and pages", %{token: token} do
      for {name, active} <- [{"Pa", true}, {"Pb", false}, {"Pc", true}] do
        Factory.insert(:account, name: name, email: "page-#{name}@example.com", is_active: active)
      end

      body =
        admin_request(
          :get,
          "/users",
          %{
            "search" => "page-",
            "status" => "active",
            "sort_by" => "name",
            "sort_dir" => "desc",
            "limit" => "1",
            "offset" => "1"
          },
          token
        )
        |> json_body(200)

      assert body["meta"] == %{"total" => 2, "limit" => 1, "offset" => 1}
      assert Enum.map(body["data"], & &1["name"]) == ["Pa"]
    end

    test "401 with a product token", %{admin: admin} do
      assert admin_request(:get, "/users", %{}, log_in(admin).access_token) |> json_body(401)
    end

    test "401 without a token" do
      assert admin_request(:get, "/users") |> json_body(401)
    end
  end

  describe "GET /users/:id" do
    test "answers one account", %{token: token} do
      user = Factory.insert(:account)
      body = admin_request(:get, "/users/#{user.id}", %{}, token) |> json_body(200)
      assert body["data"]["email"] == user.email
    end

    test "404 for an unknown or malformed id", %{token: token} do
      for id <- [Ecto.UUID.generate(), "not-a-uuid"] do
        body = admin_request(:get, "/users/#{id}", %{}, token) |> json_body(404)
        assert body["error"] == "not_found"
      end
    end
  end

  describe "account actions" do
    test "disable deactivates, revokes sessions, and blocks product login", %{token: token} do
      user = Factory.insert(:account)
      product = log_in(user)

      body = admin_request(:post, "/users/#{user.id}/disable", %{}, token) |> json_body(200)
      assert body["data"]["is_active"] == false
      assert body["data"]["active_sessions"] == 0

      refute Repo.get!(Account, user.id).is_active

      assert request(:post, "/refresh", %{"refresh_token" => product.refresh_token})
             |> json_body(401)

      assert request(:post, "/login", %{"email" => user.email, "password" => Factory.password()})
             |> json_body(403)
             |> Map.get("error") == "account_disabled"
    end

    test "422 cannot_disable_self", %{admin: admin, token: token} do
      body = admin_request(:post, "/users/#{admin.id}/disable", %{}, token) |> json_body(422)
      assert body["error"] == "cannot_disable_self"
      assert Repo.get!(Account, admin.id).is_active
    end

    test "enable reactivates and product login works again", %{token: token} do
      user = Factory.insert(:account, is_active: false)

      body = admin_request(:post, "/users/#{user.id}/enable", %{}, token) |> json_body(200)
      assert body["data"]["is_active"] == true

      assert request(:post, "/login", %{"email" => user.email, "password" => Factory.password()})
             |> json_body(200)
    end

    test "force-logout revokes every session and reports how many", %{token: token} do
      user = Factory.insert(:account)
      %{access_token: access} = log_in(user)
      log_in(user)

      body = admin_request(:post, "/users/#{user.id}/force-logout", %{}, token) |> json_body(200)
      assert body["revoked"] == 2
      assert body["data"]["is_active"] == true
      assert body["data"]["active_sessions"] == 0

      assert Repo.aggregate(
               from(s in Session, where: s.account_id == ^user.id and is_nil(s.revoked_at)),
               :count
             ) == 0

      assert request(:get, "/me", %{}, access) |> json_body(401)
    end

    test "force-logout of another admin ends their admin access token", %{token: token} do
      other = Factory.insert(:admin, %{email: "admin2@example.com", name: "Admin 2"})
      other_token = admin_log_in(other).access_token

      admin_request(:post, "/users/#{other.id}/force-logout", %{}, token) |> json_body(200)

      assert admin_request(:get, "/users", %{}, other_token) |> json_body(401)
      assert admin_request(:get, "/users", %{}, token) |> json_body(200)
    end

    test "404 for an unknown id", %{token: token} do
      for action <- ~w(disable enable force-logout) do
        assert admin_request(:post, "/users/#{Ecto.UUID.generate()}/#{action}", %{}, token)
               |> json_body(404)
      end
    end
  end
end
