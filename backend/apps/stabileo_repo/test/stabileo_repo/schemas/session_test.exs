defmodule StabileoRepo.Schemas.SessionTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.Session

  defp valid_attrs(account) do
    %{
      account_id: account.id,
      expires_at: ~U[2030-01-01 00:00:00Z]
    }
  end

  test "inserts with the required fields" do
    account = Factory.insert(:account)

    assert {:ok, session} =
             %Session{}
             |> Session.changeset(Map.put(valid_attrs(account), :ip_address, "10.0.0.1"))
             |> Repo.insert()

    saved = Repo.get!(Session, session.id)
    assert saved.account_id == account.id
    assert saved.ip_address == "10.0.0.1"
    assert saved.revoked_at == nil
  end

  for field <- [:account_id, :expires_at] do
    test "requires #{field}" do
      account = Factory.insert(:account)
      changeset = Session.changeset(%Session{}, Map.delete(valid_attrs(account), unquote(field)))
      assert %{unquote(field) => ["can't be blank"]} = errors_on(changeset)
    end
  end

  test "unknown key (user_id instead of account_id) is dropped by cast" do
    account = Factory.insert(:account)

    attrs =
      account |> valid_attrs() |> Map.delete(:account_id) |> Map.put(:user_id, account.id)

    changeset = Session.changeset(%Session{}, attrs)
    refute changeset.valid?
    assert %{account_id: ["can't be blank"]} = errors_on(changeset)
  end

  test "rejects an account that does not exist" do
    attrs = valid_attrs(%{id: Ecto.UUID.generate()})

    assert {:error, changeset} = %Session{} |> Session.changeset(attrs) |> Repo.insert()
    assert %{account_id: ["does not exist"]} = errors_on(changeset)
  end

  test "revoke_changeset stamps revoked_at" do
    session = Factory.insert(:session)
    {:ok, revoked} = session |> Session.revoke_changeset() |> Repo.update()

    assert %DateTime{} = Repo.get!(Session, revoked.id).revoked_at
  end
end
