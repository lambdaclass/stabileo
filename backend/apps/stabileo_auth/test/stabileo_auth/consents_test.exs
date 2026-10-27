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
end
