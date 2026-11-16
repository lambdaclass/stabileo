defmodule StabileoAuth.Controllers.Admin.AuditLogControllerTest do
  use StabileoAuth.ConnCase, async: false

  alias StabileoRepo.Schemas.AdminAction

  setup do
    admin = Factory.insert(:admin)
    %{admin: admin, token: admin_log_in(admin).access_token}
  end

  test "disabling an account is recorded and listed", %{admin: admin, token: token} do
    user = Factory.insert(:account)
    admin_request(:post, "/users/#{user.id}/disable", %{}, token) |> json_body(200)

    body = admin_request(:get, "/audit-log", %{}, token) |> json_body(200)
    assert body["meta"]["total"] == 1
    assert [row] = body["data"]

    assert Enum.sort(Map.keys(row)) ==
             ~w(action admin details id inserted_at target_id target_type)

    assert row["action"] == "account.disable"
    assert row["target_id"] == user.id
    assert row["admin"]["email"] == admin.email
    assert row["details"]["email"] == user.email
  end

  test "allowlist changes are recorded", %{token: token} do
    created =
      admin_request(:post, "/allowed-emails", %{"email" => "new@example.com"}, token)
      |> json_body(201)

    admin_request(:delete, "/allowed-emails/#{created["data"]["id"]}", %{}, token)
    |> json_body(200)

    actions = AdminAction |> Repo.all() |> Enum.map(& &1.action) |> Enum.sort()
    assert actions == ["allowlist.add", "allowlist.remove"]
  end

  test "a failed action records nothing", %{admin: admin, token: token} do
    admin_request(:post, "/users/#{admin.id}/disable", %{}, token) |> json_body(422)
    assert Repo.aggregate(AdminAction, :count) == 0
  end

  test "401 without an admin token, and for a product token" do
    assert admin_request(:get, "/audit-log") |> json_body(401)
    user = Factory.insert(:account)
    assert admin_request(:get, "/audit-log", %{}, log_in(user).access_token) |> json_body(401)
  end
end
