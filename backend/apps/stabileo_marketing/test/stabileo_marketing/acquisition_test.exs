defmodule StabileoMarketing.AcquisitionTest do
  use StabileoMarketing.ConnCase, async: true

  alias StabileoMarketing.{Acquisition, Days}
  alias StabileoRepo.Schemas.{AccountMilestone, SignupSource}

  defp signed_up(attrs, saved? \\ false) do
    account = Factory.insert(:account)
    Repo.insert!(struct(SignupSource, Map.merge(%{account_id: account.id, channel: "meta", paid: true}, attrs)))

    if saved?,
      do:
        Repo.insert!(%AccountMilestone{
          account_id: account.id,
          kind: "first_save",
          occurred_at: DateTime.utc_now() |> DateTime.truncate(:second)
        })

    account
  end

  test "campaigns open into ad sets and ads, from the UTM tags, with accounts and saves" do
    signed_up(%{utm_campaign: "Launch", utm_term: "Students", utm_content: "Video A"}, true)
    signed_up(%{utm_campaign: "Launch", utm_term: "Students", utm_content: "Video B"})
    signed_up(%{utm_campaign: "Launch", utm_term: "Engineers", utm_content: "Carousel"}, true)
    signed_up(%{channel: "google", utm_campaign: "123", utm_term: "456", utm_content: "789"})

    today = Days.today()
    report = Acquisition.report(Date.range(Date.add(today, -6), today), today)

    launch = Enum.find(report.campaigns, &(&1.campaign == "Launch"))
    assert %{channel: "meta", accounts: 3, saved: 2} = launch
    assert [%{ad_set: "Students", accounts: 2, saved: 1} = students, %{ad_set: "Engineers", accounts: 1}] = launch.ad_sets
    assert Enum.sort(Enum.map(students.ads, &{&1.ad, &1.accounts, &1.saved})) == [{"Video A", 1, 1}, {"Video B", 1, 0}]

    assert %{channel: "google", ad_sets: [%{ad_set: "456", ads: [%{ad: "789"}]}]} =
             Enum.find(report.campaigns, &(&1.campaign == "123"))
  end

  test "an account counts for coming back only once its seven days have all ended" do
    signed_up(%{})
    today = Days.today()
    range = Date.range(today, today)

    assert Acquisition.report(range, Date.add(today, 7)).totals.return_eligible == 0
    assert Acquisition.report(range, Date.add(today, 8)).totals.return_eligible == 1
  end

  test "days are Buenos Aires days" do
    assert Days.local_date(~U[2026-11-05 02:59:59Z]) == ~D[2026-11-04]
    assert Days.local_date(~U[2026-11-05 03:00:00Z]) == ~D[2026-11-05]
    assert Days.utc_bounds(Date.range(~D[2026-11-05], ~D[2026-11-05])) == {~U[2026-11-05 03:00:00Z], ~U[2026-11-06 03:00:00Z]}
  end
end
