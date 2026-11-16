defmodule StabileoRepo.Schemas.AccountMilestoneTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.AccountMilestone

  defp attrs(account),
    do: %{account_id: account.id, kind: "first_save", occurred_at: ~U[2026-11-02 12:00:00Z]}

  test "inserts with the required fields" do
    account = Factory.insert(:account)

    assert {:ok, milestone} =
             %AccountMilestone{} |> AccountMilestone.changeset(attrs(account)) |> Repo.insert()

    saved = Repo.get!(AccountMilestone, milestone.id)

    assert {saved.account_id, saved.kind, saved.occurred_at} ==
             {account.id, "first_save", ~U[2026-11-02 12:00:00Z]}
  end

  for field <- [:account_id, :kind, :occurred_at] do
    test "requires #{field}" do
      account = Factory.insert(:account)

      changeset =
        AccountMilestone.changeset(
          %AccountMilestone{},
          Map.delete(attrs(account), unquote(field))
        )

      assert %{unquote(field) => ["can't be blank"]} = errors_on(changeset)
    end
  end

  test "rejects an unknown kind" do
    account = Factory.insert(:account)

    assert %{kind: ["is invalid"]} =
             errors_on(
               AccountMilestone.changeset(%AccountMilestone{}, %{
                 attrs(account)
                 | kind: "first_login"
               })
             )
  end

  test "unknown key (user_id instead of account_id) is dropped by cast" do
    account = Factory.insert(:account)

    changeset =
      AccountMilestone.changeset(
        %AccountMilestone{},
        attrs(account) |> Map.delete(:account_id) |> Map.put(:user_id, account.id)
      )

    assert %{account_id: ["can't be blank"]} = errors_on(changeset)
  end

  test "one of each kind per account: a second insert fails" do
    account = Factory.insert(:account)
    {:ok, _} = %AccountMilestone{} |> AccountMilestone.changeset(attrs(account)) |> Repo.insert()

    assert {:error, changeset} =
             %AccountMilestone{} |> AccountMilestone.changeset(attrs(account)) |> Repo.insert()

    assert %{account_id: ["has already been taken"]} = errors_on(changeset)
  end
end
