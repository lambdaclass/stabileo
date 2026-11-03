defmodule StabileoRepo.Schemas.AdAccountTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.Schemas.AdAccount

  test "inserts with the required fields, pending by default" do
    assert {:ok, account} =
             %AdAccount{}
             |> AdAccount.changeset(%{channel: "meta", external_id: "act_1"})
             |> Repo.insert()

    assert Repo.get!(AdAccount, account.id).sync_status == "pending"
  end

  for field <- [:channel, :external_id] do
    test "requires #{field}" do
      changeset =
        AdAccount.changeset(
          %AdAccount{},
          Map.delete(%{channel: "meta", external_id: "act_1"}, unquote(field))
        )

      assert %{unquote(field) => ["can't be blank"]} = errors_on(changeset)
    end
  end

  test "rejects an unknown channel or status" do
    changeset =
      AdAccount.changeset(%AdAccount{}, %{
        channel: "tiktok",
        external_id: "1",
        sync_status: "lost"
      })

    assert %{channel: ["is invalid"], sync_status: ["is invalid"]} = errors_on(changeset)
  end

  test "one row per channel and id" do
    attrs = %{channel: "google", external_id: "123-456-7890"}
    {:ok, _} = %AdAccount{} |> AdAccount.changeset(attrs) |> Repo.insert()
    assert {:error, changeset} = %AdAccount{} |> AdAccount.changeset(attrs) |> Repo.insert()
    assert %{channel: ["has already been taken"]} = errors_on(changeset)
  end
end
