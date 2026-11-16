defmodule StabileoAuth.ConsentsTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoAuth.Consents
  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.Consent

  test "an account with no rows has not accepted the terms and shares nothing" do
    account = Factory.insert(:account)
    consents = Consents.current(account)
    assert consents == %{terms: nil, usage_analytics: false, model_research: false}
    refute Consents.terms_current?(consents)
  end

  test "the latest decision of each kind is the current one" do
    account = Factory.insert(:account)
    {:ok, _} = Consents.record(account, "usage_analytics", true)
    {:ok, _} = Consents.record(account, "usage_analytics", false)
    {:ok, terms} = Consents.record(account, "terms", true, %{ip_address: "10.0.0.2"})

    consents = Consents.current(account)
    assert consents.usage_analytics == false
    assert consents.terms.version == Consents.terms_version()
    assert Consents.terms_current?(consents)
    assert Repo.get!(Consent, terms.id).ip_address == "10.0.0.2"
    assert Repo.aggregate(Consent, :count) == 3
  end

  test "an older terms version is not current" do
    account = Factory.insert(:account)

    Repo.insert!(%Consent{
      account_id: account.id,
      kind: "terms",
      version: "2020-01-01",
      granted: true
    })

    refute Consents.terms_current?(Consents.current(account))
  end

  test "current_for answers every account asked for, in one query" do
    a = Factory.insert(:account)
    b = Factory.insert(:account)
    {:ok, _} = Consents.record(a, "model_research", true)

    result = Consents.current_for([a.id, b.id])
    assert result[a.id].model_research == true
    assert result[b.id].model_research == false
    assert Consents.research_granted([a.id, b.id]) == MapSet.new([a.id])
  end

  test "record rejects an unknown kind and a declined terms" do
    account = Factory.insert(:account)
    assert {:error, changeset} = Consents.record(account, "newsletter", true)
    assert %{kind: ["is invalid"]} = errors_on(changeset)
    assert {:error, changeset} = Consents.record(account, "terms", false)
    assert %{granted: ["must be accepted"]} = errors_on(changeset)
  end

  test "record_sign_up records nothing when an optional consent is invalid" do
    account = Factory.insert(:account)

    assert {:error, %Ecto.Changeset{}} =
             Consents.record_sign_up(account, %{"usage_analytics" => true}, %{
               ip_address: String.duplicate("9", 65)
             })

    assert Repo.aggregate(Consent, :count) == 0
  end

  test "the web app publishes the terms version in force" do
    legal = File.read!(Path.expand("../../../../../web/src/lib/legal/legal.ts", __DIR__))
    assert legal =~ ~s(LEGAL_VERSION = '#{Consents.terms_version()}')
  end

  test "known wrong result: #765 T1 — withdrawal wins with identical timestamps" do
    account = Factory.insert(:account)
    {:ok, grant} = Consents.record(account, "model_research", true)
    {:ok, withdrawal} = Consents.record(account, "model_research", false)

    Repo.query!("UPDATE consents SET inserted_at = $1, id = $2 WHERE id = $3", [
      grant.inserted_at,
      Ecto.UUID.dump!("ffffffff-ffff-4fff-8fff-ffffffffffff"),
      Ecto.UUID.dump!(grant.id)
    ])

    Repo.query!("UPDATE consents SET inserted_at = $1, id = $2 WHERE id = $3", [
      grant.inserted_at,
      Ecto.UUID.dump!("00000000-0000-4000-8000-000000000000"),
      Ecto.UUID.dump!(withdrawal.id)
    ])

    refute Consents.current(account).model_research
    refute Consents.current_for([account.id])[account.id].model_research
    refute MapSet.member?(Consents.research_granted([account.id]), account.id)
    {:ok, regrant} = Consents.record(account, "model_research", true)
    assert regrant.revision > withdrawal.revision
    assert Consents.current(account).model_research
  end

  test "an explicit research opt-in remains available" do
    account = Factory.insert(:account)
    assert {:ok, :ok} = Consents.record_sign_up(account, %{"model_research" => true}, %{})
    assert Consents.current(account).model_research
  end
end
