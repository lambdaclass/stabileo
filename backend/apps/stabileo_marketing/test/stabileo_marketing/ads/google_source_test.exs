defmodule StabileoMarketing.Ads.Sources.GoogleTest do
  use StabileoMarketing.ConnCase, async: false

  alias StabileoMarketing.Ads.Sources.Google
  alias StabileoRepo.Schemas.AdAccount

  @account %AdAccount{channel: "google", external_id: "123-456-7890"}
  @today ~D[2026-11-02]

  setup do
    key = :public_key.generate_key({:rsa, 2048, 65_537})
    pem = :public_key.pem_encode([:public_key.pem_entry_encode(:RSAPrivateKey, key)])

    configure(%{
      "google_ads_service_account" => Jason.encode!(%{"client_email" => "reader@p.iam.gserviceaccount.com", "private_key" => pem}),
      "google_ads_login_customer_id" => "999-888-7777"
    })

    :ok
  end

  defp stream(results), do: {:ok, [%{"results" => results}]}

  test "signs in with the service account, no developer token, and counts SIGNUP conversions as sign-ups" do
    HttpStub.stub([
      {"oauth2.googleapis.com/token", {:ok, %{"access_token" => "ya29.token"}}},
      {"FROM customer", stream([%{"customer" => %{"descriptiveName" => "Stabileo", "currencyCode" => "USD"}}])},
      {"FROM campaign WHERE campaign.status",
       stream([%{"campaign" => %{"id" => "77", "name" => "Search AR", "status" => "ENABLED", "advertisingChannelType" => "SEARCH"}, "campaignBudget" => %{"amountMicros" => "20000000"}}])},
      {"FROM ad_group WHERE ad_group.status", stream([])},
      {"FROM ad_group_ad WHERE ad_group_ad.status", stream([])},
      {"segments.conversion_action_category",
       stream([
         %{"segments" => %{"date" => "2026-11-01", "conversionActionCategory" => "SIGNUP", "conversionActionName" => "Cuenta creada"}, "campaign" => %{"id" => "77"}, "metrics" => %{"conversions" => 3.0}},
         %{"segments" => %{"date" => "2026-11-01", "conversionActionCategory" => "PAGE_VIEW", "conversionActionName" => "Visita"}, "campaign" => %{"id" => "77"}, "metrics" => %{"conversions" => 50.0}}
       ])},
      {"FROM campaign WHERE segments.date",
       stream([%{"segments" => %{"date" => "2026-11-01"}, "campaign" => %{"id" => "77"}, "metrics" => %{"costMicros" => "4500000", "impressions" => "900", "clicks" => "40", "conversions" => 53.0}}])},
      {"FROM ad_group WHERE segments.date", stream([])},
      {"FROM ad_group_ad WHERE segments.date", stream([])},
      {"FROM change_event", stream([])}
    ])

    assert {:ok, snapshot} = Google.fetch(@account, Date.range(~D[2026-11-01], @today), @today)
    assert snapshot.account == %{name: "Stabileo", currency: "USD"}
    [metric] = snapshot.metrics
    assert Decimal.equal?(metric.spend, "4.5")
    assert Decimal.equal?(metric.signups, 3)
    assert Decimal.equal?(metric.results, "53.0")
    assert is_nil(Map.get(metric, :activations))
    assert [%{budget: budget, estimated: false}] = Enum.filter(snapshot.budgets, &(&1.date == ~D[2026-11-01]))
    assert Decimal.equal?(budget, 20)

    search = Enum.find(HttpStub.requests(), &String.contains?(&1.url, "searchStream"))
    assert search.url =~ "/customers/1234567890/"
    assert {"Authorization", "Bearer ya29.token"} in search.headers
    assert {"login-customer-id", "9998887777"} in search.headers
    refute Enum.any?(search.headers, fn {name, _} -> name == "developer-token" end)

    token = Enum.find(HttpStub.requests(), &(&1.method == :post_form))
    assert {"grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"} in token.form
  end

  test "a key that is not a service account is reported, not raised" do
    configure(%{"google_ads_service_account" => nil})
    assert {:error, :not_connected} = Google.fetch(@account, Date.range(@today, @today), @today)
    assert [%{key: "credentials", status: :error} | _] = Google.check(@account)
  end
end
