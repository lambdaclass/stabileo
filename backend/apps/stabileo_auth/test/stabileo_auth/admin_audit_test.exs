defmodule StabileoAuth.AdminAuditTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoAuth.AdminAudit
  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.AdminAction

  test "record keeps who did what to what" do
    admin = Factory.insert(:account)

    assert {:ok, row} =
             AdminAudit.record(admin, "account.disable", {"account", "abc"}, %{email: "x@y.z"})

    saved = Repo.get!(AdminAction, row.id)
    assert saved.admin_id == admin.id
    assert saved.target_type == "account"
    assert saved.target_id == "abc"
    assert saved.details == %{"email" => "x@y.z"}
  end

  test "record answers the error instead of raising on a bad action name" do
    admin = Factory.insert(:account)
    assert {:error, changeset} = AdminAudit.record(admin, "Disable!")
    assert %{action: ["has invalid format"]} = errors_on(changeset)
  end

  test "list is newest first and filters by action and admin" do
    a = Factory.insert(:account)
    b = Factory.insert(:account)
    {:ok, first} = AdminAudit.record(a, "account.disable", {"account", "1"})
    Repo.update_all(AdminAction, set: [inserted_at: ~U[2026-01-01 00:00:00Z]])
    {:ok, second} = AdminAudit.record(b, "settings.update")

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
