defmodule StabileoAuth.Controllers.Admin.AllowedEmailControllerTest do
  use StabileoAuth.ConnCase, async: false

  alias StabileoRepo.Schemas.AdminAllowedEmail

  setup do
    admin = Factory.insert(:admin)
    %{admin: admin, token: admin_log_in(admin).access_token}
  end

  test "lists active emails with meta and shape", %{admin: admin, token: token} do
    body = admin_request(:get, "/allowed-emails", %{}, token) |> json_body(200)

    assert body["meta"]["total"] == 1
    assert [row] = body["data"]
    assert Enum.sort(Map.keys(row)) == ~w(added_by email id inserted_at is_active updated_at)
    assert row["email"] == admin.email
    assert row["added_by"] == nil
  end

  test "adds an email, recording who added it", %{admin: admin, token: token} do
    body =
      admin_request(:post, "/allowed-emails", %{"email" => "New@Example.com"}, token)
      |> json_body(201)

    assert body["data"]["email"] == "new@example.com"
    assert body["data"]["added_by"] == %{"id" => admin.id, "email" => admin.email}
    assert Repo.get_by!(AdminAllowedEmail, email: "new@example.com").is_active
  end

  test "422 with details.email for a bad, foreign or duplicate email", %{
    admin: admin,
    token: token
  } do
    for {email, message} <- [
          {"nope", "must have @ sign and no spaces"},
          {"x@gmail.com", "must be at an allowed domain"},
          {admin.email, "is already allowed"}
        ] do
      body = admin_request(:post, "/allowed-emails", %{"email" => email}, token) |> json_body(422)
      assert body["details"]["email"] == [message]
    end
  end

  test "removing takes admin access away on the next request", %{token: token} do
    other = Factory.insert(:admin, email: "other@example.com")
    other_token = admin_log_in(other).access_token
    row = Repo.get_by!(AdminAllowedEmail, email: "other@example.com")

    body = admin_request(:delete, "/allowed-emails/#{row.id}", %{}, token) |> json_body(200)
    assert body["data"]["is_active"] == false

    assert admin_request(:get, "/users", %{}, other_token) |> json_body(401) |> Map.get("error") ==
             "not_admin"
  end

  test "422 cannot_remove_self", %{admin: admin, token: token} do
    row = Repo.get_by!(AdminAllowedEmail, email: admin.email)
    body = admin_request(:delete, "/allowed-emails/#{row.id}", %{}, token) |> json_body(422)
    assert body["error"] == "cannot_remove_self"
    assert Repo.get!(AdminAllowedEmail, row.id).is_active
  end

  test "re-adding a removed email reactivates the same row", %{token: token} do
    removed = Factory.insert(:allowed_email, email: "gone@example.com", is_active: false)

    body =
      admin_request(:post, "/allowed-emails", %{"email" => "gone@example.com"}, token)
      |> json_body(201)

    assert body["data"]["id"] == removed.id
    assert body["data"]["is_active"] == true
  end

  test "404 for an unknown or malformed id", %{token: token} do
    for id <- [Ecto.UUID.generate(), "nope"] do
      assert admin_request(:delete, "/allowed-emails/#{id}", %{}, token) |> json_body(404)
    end
  end

  test "401 without an admin token" do
    assert admin_request(:get, "/allowed-emails") |> json_body(401)
  end
end
