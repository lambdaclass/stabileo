defmodule StabileoMarketing.Ads.Sources.MetaTest do
  use StabileoMarketing.ConnCase, async: false

  alias StabileoMarketing.Ads.Sources.Meta
  alias StabileoRepo.Schemas.AdAccount

  @account %AdAccount{channel: "meta", external_id: "act_1234567"}
  @today ~D[2026-11-02]

  defp rule(event), do: Jason.encode!(%{"and" => [%{"event" => %{"eq" => event}}]})

  defp stub(insights) do
    HttpStub.stub([
      {["act_1234567/insights", "use_unified_attribution_setting=true", "action_report_time=impression"], {:ok, %{"data" => insights}}},
      {"act_1234567/customconversions",
       {:ok, %{"data" => [%{"id" => "901", "name" => "Clic en crear cuenta", "rule" => rule("SignUpClick")}, %{"id" => "902", "name" => "Primer guardado", "rule" => rule("FirstSave")}]}}},
      {"act_1234567/activities", {:ok, %{"data" => []}}},
      {"act_1234567/campaigns",
       {:ok, %{"data" => [%{"id" => "c1", "name" => "Registro AR", "objective" => "OUTCOME_SALES", "effective_status" => "ACTIVE", "status" => "ACTIVE", "daily_budget" => "150000"}]}}},
      {"act_1234567/adsets",
       {:ok, %{"data" => [%{"id" => "s1", "campaign_id" => "c1", "effective_status" => "ACTIVE", "optimization_goal" => "OFFSITE_CONVERSIONS", "promoted_object" => %{"custom_event_type" => "COMPLETE_REGISTRATION"}}]}}},
      {"act_1234567/ads",
       {:ok, %{"data" => [%{"id" => "a1", "adset_id" => "s1", "campaign_id" => "c1", "effective_status" => "ACTIVE", "preview_shareable_link" => "https://fb.me/p", "creative" => %{"thumbnail_url" => "https://t", "video_id" => "v"}}]}}},
      {"act_1234567?fields", {:ok, %{"name" => "Stabileo", "currency" => "ARS"}}}
    ])
  end

  test "reads each level with Ads Manager's attribution, sign-ups once, and the custom conversions by their rule" do
    stub([
      %{
        "date_start" => "2026-11-01",
        "campaign_id" => "c1",
        "adset_id" => "s1",
        "ad_id" => "a1",
        "spend" => "1500.50",
        "impressions" => "10000",
        "reach" => "8000",
        "inline_link_clicks" => "320",
        "unique_inline_link_clicks" => [%{"value" => "300"}],
        "actions" => [
          %{"action_type" => "link_click", "value" => "310"},
          %{"action_type" => "offsite_conversion.fb_pixel_complete_registration", "value" => "12"},
          %{"action_type" => "complete_registration", "value" => "12"},
          %{"action_type" => "offsite_conversion.custom.901", "value" => "40"},
          %{"action_type" => "offsite_conversion.custom.902", "value" => "5"}
        ],
        "results" => [%{"indicator" => "actions:offsite_conversion.fb_pixel_complete_registration", "values" => [%{"value" => "12"}]}]
      }
    ])

    assert {:ok, snapshot} = Meta.fetch(@account, Date.range(~D[2026-11-01], @today), @today)
    assert snapshot.account == %{name: "Stabileo", currency: "ARS"}
    assert length(snapshot.metrics) == 3

    campaign = Enum.find(snapshot.metrics, &(&1.level == "campaign"))
    assert Decimal.equal?(campaign.spend, "1500.50")
    assert Decimal.equal?(campaign.clicks, 310)
    assert Decimal.equal?(campaign.unique_clicks, 300)
    assert Decimal.equal?(campaign.signups, 12)
    assert Decimal.equal?(campaign.signup_clicks, 40)
    assert Decimal.equal?(campaign.activations, 5)
    assert campaign.result_type == "actions:offsite_conversion.fb_pixel_complete_registration"

    custom = Enum.find(snapshot.conversions, &(&1.conversion_key == "offsite_conversion.custom.902" and &1.level == "ad"))
    assert {custom.conversion_name, custom.conversion_group} == {"Primer guardado", "custom"}

    entity = Enum.find(snapshot.entities, &(&1.level == "campaign"))
    assert entity.objective == "OUTCOME_SALES"
    assert Decimal.equal?(entity.daily_budget, 1500)
    assert entity.details["goal"] == "signups"

    ad = Enum.find(snapshot.entities, &(&1.level == "ad"))
    assert ad.creative["preview_url"] == "https://fb.me/p"
    assert ad.creative["format"] == "video"
  end

  test "without custom conversions, sign-up clicks and activations are not measured" do
    stub([%{"date_start" => "2026-11-01", "campaign_id" => "c1", "spend" => "10"}])

    HttpStub.stub(
      [{"act_1234567/customconversions", {:error, {:http_error, 403, "no permission"}}} | Process.get(:http_stub_routes)]
    )

    assert {:ok, snapshot} = Meta.fetch(@account, Date.range(@today, @today), @today)
    assert Enum.all?(snapshot.metrics, &(is_nil(&1.signup_clicks) and is_nil(&1.activations)))
  end

  test "without a token the account is not connected, and check says which step" do
    configure(%{"meta_ads_access_token" => nil})
    assert {:error, :not_connected} = Meta.fetch(@account, Date.range(@today, @today), @today)
    assert [%{key: "credentials", status: :error}, %{status: :skipped}, %{status: :skipped}] = Meta.check(@account)
  end

  setup do
    configure(%{"meta_ads_access_token" => "EAAB-ads-token-0123456789"})
    :ok
  end
end
