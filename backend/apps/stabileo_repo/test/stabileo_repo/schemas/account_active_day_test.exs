defmodule StabileoRepo.Schemas.AccountActiveDayTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.AccountActiveDay

  test "inserts, requires both fields, and keeps one row per account and day" do
    account = Factory.insert(:account)
    attrs = %{account_id: account.id, day: ~D[2026-11-02]}
    assert {:ok, day} = %AccountActiveDay{} |> AccountActiveDay.changeset(attrs) |> Repo.insert()
    assert Repo.get!(AccountActiveDay, day.id).day == ~D[2026-11-02]

    assert %{day: ["can't be blank"]} =
             errors_on(AccountActiveDay.changeset(%AccountActiveDay{}, %{account_id: account.id}))

    assert %{account_id: ["can't be blank"]} =
             errors_on(
               AccountActiveDay.changeset(%AccountActiveDay{}, %{
                 user_id: account.id,
                 day: ~D[2026-11-02]
               })
             )

    assert {:error, changeset} =
             %AccountActiveDay{} |> AccountActiveDay.changeset(attrs) |> Repo.insert()

    assert %{account_id: ["has already been taken"]} = errors_on(changeset)
  end
end
