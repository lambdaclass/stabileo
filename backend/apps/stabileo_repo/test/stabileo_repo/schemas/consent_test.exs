defmodule StabileoRepo.Schemas.ConsentTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.Consent

  defp valid_attrs(account) do
    %{account_id: account.id, kind: "usage_analytics", granted: true}
  end

  test "inserts with the required fields" do
    account = Factory.insert(:account)

    assert {:ok, consent} =
             %Consent{}
             |> Consent.changeset(
               Map.put(valid_attrs(account), :user_agent, String.duplicate("a", 600))
             )
             |> Repo.insert()

    saved = Repo.get!(Consent, consent.id)
    assert saved.account_id == account.id
    assert saved.kind == "usage_analytics"
    assert saved.granted == true
    assert String.length(saved.user_agent) == 600
  end

  for field <- [:account_id, :kind, :granted] do
    test "requires #{field}" do
      account = Factory.insert(:account)
      changeset = Consent.changeset(%Consent{}, Map.delete(valid_attrs(account), unquote(field)))
      assert %{unquote(field) => ["can't be blank"]} = errors_on(changeset)
    end
  end

  test "rejects an unknown kind" do
    account = Factory.insert(:account)
    changeset = Consent.changeset(%Consent{}, %{valid_attrs(account) | kind: "marketing"})
    assert %{kind: ["is invalid"]} = errors_on(changeset)
  end

  test "terms need the version accepted" do
    account = Factory.insert(:account)
    changeset = Consent.changeset(%Consent{}, %{valid_attrs(account) | kind: "terms"})
    assert %{version: ["can't be blank"]} = errors_on(changeset)
  end

  test "terms cannot be declined" do
    account = Factory.insert(:account)

    changeset =
      Consent.changeset(%Consent{}, %{
        account_id: account.id,
        kind: "terms",
        version: "2026-10-27",
        granted: false
      })

    assert %{granted: ["must be accepted"]} = errors_on(changeset)
  end

  test "unknown key (user_id instead of account_id) is dropped by cast" do
    account = Factory.insert(:account)
    attrs = account |> valid_attrs() |> Map.delete(:account_id) |> Map.put(:user_id, account.id)
    changeset = Consent.changeset(%Consent{}, attrs)
    refute changeset.valid?
    assert %{account_id: ["can't be blank"]} = errors_on(changeset)
  end
end
