defmodule StabileoAuth.AdminAuditTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoAuth.AdminAudit
  alias StabileoRepo.{Factory, SystemSettings}
  alias StabileoRepo.Schemas.AdminAction

  defp audited(admin, action, target \\ nil, details \\ %{}) do
    AdminAudit.run(admin, action, fn -> {:ok, :done, target, details} end)
  end

  test "run does the action and keeps who did what to what" do
    admin = Factory.insert(:account)

    assert {:ok, :done} =
             audited(admin, "account.disable", {"account", "abc"}, %{email: "x@y.z"})

    saved = Repo.one!(AdminAction)
    assert saved.admin_id == admin.id
    assert saved.action == "account.disable"
    assert saved.target_type == "account"
    assert saved.target_id == "abc"
    assert saved.details == %{"email" => "x@y.z"}
  end

  test "an audit row that cannot be written undoes the action" do
    admin = Factory.insert(:account)

    assert {:error, changeset} =
             AdminAudit.run(admin, "Disable!", fn ->
               {:ok, _} = SystemSettings.set_flag("user_login_enabled", true)
               {:ok, :done, nil, %{}}
             end)

    assert %{action: ["has invalid format"]} = errors_on(changeset)
    assert SystemSettings.get("user_login_enabled") == nil
    assert Repo.aggregate(AdminAction, :count) == 0
  end

  test "a failed action writes no audit row" do
    admin = Factory.insert(:account)

    assert {:error, :not_found} =
             AdminAudit.run(admin, "account.disable", fn -> {:error, :not_found} end)

    assert Repo.aggregate(AdminAction, :count) == 0
  end

  test "list is newest first and filters by action and admin" do
    a = Factory.insert(:account)
    b = Factory.insert(:account)
    {:ok, _} = audited(a, "account.disable", {"account", "1"})
    Repo.update_all(AdminAction, set: [inserted_at: ~U[2026-01-01 00:00:00Z]])
    {:ok, _} = audited(b, "settings.update")
    first = Repo.get_by!(AdminAction, action: "account.disable")
    second = Repo.get_by!(AdminAction, action: "settings.update")

    {rows, meta} = AdminAudit.list(%{})
    assert meta.total == 2
    assert Enum.map(rows, & &1.id) == [second.id, first.id]
    assert hd(rows).admin.email == b.email

    {rows, _} = AdminAudit.list(%{"action" => "account.disable"})
    assert Enum.map(rows, & &1.id) == [first.id]

    {rows, _} = AdminAudit.list(%{"admin_id" => b.id})
    assert Enum.map(rows, & &1.id) == [second.id]

    {rows, _} = AdminAudit.list(%{"admin_id" => "not-a-uuid"})
    assert rows == []
  end
end
