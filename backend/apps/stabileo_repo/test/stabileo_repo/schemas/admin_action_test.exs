defmodule StabileoRepo.Schemas.AdminActionTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.AdminAction

  defp valid_attrs(admin), do: %{admin_id: admin.id, action: "account.disable"}

  test "inserts with the required fields" do
    admin = Factory.insert(:account)

    assert {:ok, action} =
             %AdminAction{}
             |> AdminAction.changeset(
               Map.merge(valid_attrs(admin), %{
                 target_type: "account",
                 target_id: "x",
                 details: %{"a" => 1}
               })
             )
             |> Repo.insert()

    saved = Repo.get!(AdminAction, action.id)
    assert saved.admin_id == admin.id
    assert saved.action == "account.disable"
    assert saved.details == %{"a" => 1}
  end

  for field <- [:admin_id, :action] do
    test "requires #{field}" do
      admin = Factory.insert(:account)

      changeset =
        AdminAction.changeset(%AdminAction{}, Map.delete(valid_attrs(admin), unquote(field)))

      assert %{unquote(field) => ["can't be blank"]} = errors_on(changeset)
    end
  end

  test "actions are named <target>.<verb>" do
    admin = Factory.insert(:account)
    changeset = AdminAction.changeset(%AdminAction{}, %{valid_attrs(admin) | action: "disable"})
    assert %{action: ["has invalid format"]} = errors_on(changeset)
  end

  test "unknown key (account_id instead of admin_id) is dropped by cast" do
    admin = Factory.insert(:account)
    attrs = admin |> valid_attrs() |> Map.delete(:admin_id) |> Map.put(:account_id, admin.id)
    changeset = AdminAction.changeset(%AdminAction{}, attrs)
    refute changeset.valid?
    assert %{admin_id: ["can't be blank"]} = errors_on(changeset)
  end
end
