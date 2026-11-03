defmodule StabileoMarketing.AdsTest do
  use StabileoMarketing.ConnCase, async: false

  alias StabileoMarketing.Ads
  alias StabileoMarketing.Ads.Sync
  alias StabileoMarketing.{FakeSource, SignupSources}
  alias StabileoRepo.Schemas.{AccountMilestone, AdDailyMetric, AdFxRate}

  @today ~D[2026-11-02]

  setup do
    Application.put_env(:stabileo_marketing, :meta_source, FakeSource)
    on_exit(fn -> Application.delete_env(:stabileo_marketing, :meta_source) end)
    configure(%{"meta_ad_account_id" => "act_1234567"})
    :ok
  end

  defp day(date, level, id, spend, extra \\ %{}) do
    Map.merge(
      %{
        date: date,
        level: level,
        external_id: id,
        campaign_external_id: "c1",
        ad_group_external_id: if(level != "campaign", do: "s1"),
        spend: Decimal.new(spend),
        impressions: Decimal.new(1000),
        clicks: Decimal.new(50),
        signups: Decimal.new(2),
        result_type: "actions:offsite_conversion.fb_pixel_complete_registration",
        results: Decimal.new(2)
      },
      extra
    )
  end

  defp snapshot(days) do
    {:ok,
     %{
       account: %{name: "Stabileo", currency: "ARS"},
       entities: [
         %{level: "campaign", external_id: "c1", campaign_external_id: "c1", name: "Registro AR", status: "active", objective: "OUTCOME_SALES", daily_budget: Decimal.new(10_000), details: %{"goal" => "signups"}},
         %{level: "ad_group", external_id: "s1", campaign_external_id: "c1", name: "Ingenieros", status: "active"},
         %{level: "ad", external_id: "a1", campaign_external_id: "c1", ad_group_external_id: "s1", name: "Video pórtico", status: "active", creative: %{"preview_url" => "https://fb.me/p"}}
       ],
       metrics: days,
       conversions: [],
       budgets: [%{date: ~D[2026-11-01], campaign_external_id: "c1", budget: Decimal.new(10_000), estimated: false}]
     }}
  end

  defp sign_up_from(campaign, ad, activated?) do
    account = Factory.insert(:account)
    {:ok, source} = SignupSources.record(account, %{"utm_source" => "fb", "utm_medium" => "paid", "utm_campaign" => campaign, "utm_term" => "s1", "utm_content" => ad})
    Repo.update_all(from(s in "signup_sources", where: s.id == type(^source.id, :binary_id)), set: [inserted_at: ~U[2026-11-01 15:00:00Z]])

    if activated?,
      do: Repo.insert!(%AccountMilestone{account_id: account.id, kind: "first_save", occurred_at: ~U[2026-11-01 16:00:00Z]})
  end

  test "a sync stores the days, and a second one replaces them" do
    FakeSource.put(snapshot([day(~D[2026-11-01], "campaign", "c1", 3000)]))
    [account] = Ads.accounts()
    HttpStub.stub([{"argentinadatos", {:ok, [%{"fecha" => "2026-11-01", "venta" => 1500.0}]}}])

    assert {:ok, synced} = Sync.run(account, ~U[2026-11-02 15:00:00Z])
    assert {synced.sync_status, synced.name, synced.currency} == {"ok", "Stabileo", "ARS"}
    assert Repo.get!(AdFxRate, ~D[2026-11-01]).usd_ars |> Decimal.equal?(1500)

    FakeSource.put(snapshot([day(~D[2026-11-01], "campaign", "c1", 4500)]))
    assert {:ok, _} = Sync.run(synced, ~U[2026-11-02 16:00:00Z])
    assert [metric] = Repo.all(AdDailyMetric)
    assert Decimal.equal?(metric.spend, 4500)
  end

  test "a failing source marks the account and keeps what it had" do
    [account] = Ads.accounts()
    FakeSource.put({:error, {:http_error, 401, "Invalid OAuth access token"}})
    assert {:error, {:http_error, 401, _}} = Sync.run(account, ~U[2026-11-02 15:00:00Z])
    assert Repo.get!(account.__struct__, account.id).last_sync_error == "HTTP 401: Invalid OAuth access token"
  end

  test "the overview converts to the chosen currency and counts the accounts our database attributes to each ad" do
    FakeSource.put(
      snapshot([
        day(~D[2026-11-01], "campaign", "c1", 3000, %{signup_clicks: Decimal.new(10)}),
        day(~D[2026-11-01], "ad_group", "s1", 3000),
        day(~D[2026-11-01], "ad", "a1", 3000)
      ])
    )

    HttpStub.stub([{"argentinadatos", {:ok, [%{"fecha" => "2026-11-01", "venta" => 1500.0}]}}])
    [account] = Ads.accounts()
    {:ok, _} = Sync.run(account, ~U[2026-11-02 15:00:00Z])

    sign_up_from("c1", "a1", true)
    sign_up_from("Registro AR", "a1", false)
    sign_up_from("other", "a9", true)

    usd = Ads.overview(%{channel: "all", range: Date.range(~D[2026-11-01], ~D[2026-11-01]), display: "USD", today: @today})
    current = usd.kpis.current
    assert current.spend == 2.0
    assert current.signups == 2.0
    assert current.signup_clicks == 10.0
    assert current.signup_rate == 0.2
    assert {current.accounts, current.activated} == {3, 2}
    assert current.cost_per_account == 2.0 / 3

    [campaign] = usd.tree
    assert {campaign.name, campaign.accounts, campaign.activated} == {"Registro AR", 2, 1}
    [group] = campaign.children
    [ad] = group.children
    assert {ad.accounts, ad.activated} == {2, 1}
    assert ad.links.preview == "https://fb.me/p"
    assert ad.links.manager =~ "selected_ad_ids=a1"
    assert usd.goals.metrics["signups"].cost == 1.0

    ars = Ads.overview(%{channel: "meta", range: {:last_days, 1}, display: "ARS", today: @today})
    assert ars.kpis.current.spend == 3000.0
    assert ars.period.to == ~D[2026-11-01]
    refute ars.fx_missing

    google = Ads.overview(%{channel: "google", range: {:last_days, 7}, display: "USD", today: @today})
    assert google.tree == []
  end
end
