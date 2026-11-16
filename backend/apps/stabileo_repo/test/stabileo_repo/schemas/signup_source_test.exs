defmodule StabileoRepo.Schemas.SignupSourceTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.SignupSource

  test "inserts with the required fields" do
    account = Factory.insert(:account)

    assert {:ok, source} =
             %SignupSource{}
             |> SignupSource.changeset(%{account_id: account.id, channel: "meta", paid: true})
             |> Repo.insert()

    saved = Repo.get!(SignupSource, source.id)
    assert {saved.account_id, saved.channel, saved.paid} == {account.id, "meta", true}
  end

  for field <- [:account_id, :channel] do
    test "requires #{field}" do
      account = Factory.insert(:account)

      changeset =
        SignupSource.changeset(
          %SignupSource{},
          Map.delete(%{account_id: account.id, channel: "meta"}, unquote(field))
        )

      assert %{unquote(field) => ["can't be blank"]} = errors_on(changeset)
    end
  end

  test "rejects an unknown channel and an overlong tag" do
    account = Factory.insert(:account)

    changeset =
      SignupSource.changeset(%SignupSource{}, %{
        account_id: account.id,
        channel: "tiktok",
        utm_source: String.duplicate("x", 256)
      })

    assert %{channel: ["is invalid"], utm_source: [_]} = errors_on(changeset)
  end

  test "unknown key (user_id instead of account_id) is dropped by cast" do
    account = Factory.insert(:account)
    changeset = SignupSource.changeset(%SignupSource{}, %{user_id: account.id, channel: "meta"})
    assert %{account_id: ["can't be blank"]} = errors_on(changeset)
  end

  test "one source per account: a second insert fails on account_id" do
    account = Factory.insert(:account)
    attrs = %{account_id: account.id, channel: "direct"}
    {:ok, _} = %SignupSource{} |> SignupSource.changeset(attrs) |> Repo.insert()
    assert {:error, changeset} = %SignupSource{} |> SignupSource.changeset(attrs) |> Repo.insert()
    assert %{account_id: ["has already been taken"]} = errors_on(changeset)
  end
end
