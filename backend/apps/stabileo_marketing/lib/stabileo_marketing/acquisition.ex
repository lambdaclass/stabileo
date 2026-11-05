defmodule StabileoMarketing.Acquisition do
  @moduledoc """
  Campaign, ad set and ad are the ads' `utm_campaign`, `utm_term` and `utm_content`, as the
  URL parameters in Settings → Advertising set them. Coming back counts only accounts at least
  7 days old.
  """

  import Ecto.Query

  alias StabileoMarketing.Days
  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.{Account, AccountActiveDay, AccountMilestone, SignupSource}

  @top_campaigns 20

  def report(%Date.Range{} = range, today) do
    {from, to} = Days.utc_bounds(range)

    accounts =
      Repo.all(
        from(a in Account,
          left_join: s in SignupSource,
          on: s.account_id == a.id,
          where: a.inserted_at >= ^from and a.inserted_at < ^to,
          select: %{
            id: a.id,
            at: a.inserted_at,
            channel: coalesce(s.channel, "unknown"),
            paid: s.paid,
            trigger: s.trigger,
            campaign: s.utm_campaign,
            ad_set: s.utm_term,
            ad: s.utm_content
          }
        )
      )

    ids = Enum.map(accounts, & &1.id)

    milestones =
      from(m in AccountMilestone, where: m.account_id in ^ids, select: {m.account_id, m.kind, m.occurred_at})
      |> Repo.all()
      |> Enum.group_by(&elem(&1, 0), &{elem(&1, 1), elem(&1, 2)})
      |> Map.new(fn {id, kinds} -> {id, Map.new(kinds)} end)

    days =
      from(d in AccountActiveDay, where: d.account_id in ^ids, select: {d.account_id, d.day})
      |> Repo.all()
      |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))

    rows =
      Enum.map(accounts, fn account ->
        reached = Map.get(milestones, account.id, %{})
        signup_day = Days.local_date(account.at)

        Map.merge(account, %{
          analyzed: Map.has_key?(reached, "first_analysis"),
          saved: Map.has_key?(reached, "first_save"),
          exported: Map.has_key?(reached, "first_export"),
          hours_to_save: hours(account.at, reached["first_save"]),
          eligible: Date.diff(today, signup_day) >= 7,
          returned:
            Enum.any?(Map.get(days, account.id, []), fn day ->
              Date.diff(day, signup_day) in 1..7
            end)
        })
      end)

    %{
      period: %{from: range.first, to: range.last},
      totals: summary(rows),
      channels: group(rows, & &1.channel, :channel),
      triggers: group(rows, &(&1.trigger || "unknown"), :trigger),
      campaigns:
        rows
        |> Enum.filter(&(&1.campaign != nil))
        |> Enum.group_by(&{&1.channel, &1.campaign})
        |> Enum.map(fn {{channel, campaign}, group} ->
          Map.merge(summary(group), %{channel: channel, campaign: campaign, ad_sets: ad_sets(group)})
        end)
        |> Enum.sort_by(&{-&1.accounts, &1.campaign})
        |> Enum.take(@top_campaigns),
      daily:
        Enum.map(range, fn date ->
          today_rows = Enum.filter(rows, &(Days.local_date(&1.at) == date))
          %{date: date, accounts: length(today_rows), by_channel: Enum.frequencies_by(today_rows, & &1.channel)}
        end)
    }
  end

  defp ad_sets(rows) do
    rows
    |> Enum.group_by(& &1.ad_set)
    |> Enum.map(fn {ad_set, group} ->
      ads = group |> Enum.group_by(& &1.ad) |> Enum.map(fn {ad, ad_rows} -> Map.put(summary(ad_rows), :ad, ad) end)
      Map.merge(summary(group), %{ad_set: ad_set, ads: Enum.sort_by(ads, &(-&1.accounts))})
    end)
    |> Enum.sort_by(&(-&1.accounts))
  end

  defp group(rows, key, name) do
    rows
    |> Enum.group_by(key)
    |> Enum.map(fn {value, group} -> Map.put(summary(group), name, value) end)
    |> Enum.sort_by(&(-&1.accounts))
  end

  defp summary(rows) do
    eligible = Enum.filter(rows, & &1.eligible)
    hours = rows |> Enum.map(& &1.hours_to_save) |> Enum.reject(&is_nil/1) |> Enum.sort()

    %{
      accounts: length(rows),
      paid: Enum.count(rows, &(&1.paid == true)),
      analyzed: Enum.count(rows, & &1.analyzed),
      saved: Enum.count(rows, & &1.saved),
      exported: Enum.count(rows, & &1.exported),
      return_eligible: length(eligible),
      returned: Enum.count(eligible, & &1.returned),
      median_hours_to_save: median(hours)
    }
  end

  defp hours(_signed_up, nil), do: nil
  defp hours(signed_up, at), do: max(DateTime.diff(at, signed_up, :second), 0) / 3600

  defp median([]), do: nil

  defp median(sorted) do
    middle = div(length(sorted), 2)

    if rem(length(sorted), 2) == 1,
      do: Enum.at(sorted, middle),
      else: (Enum.at(sorted, middle - 1) + Enum.at(sorted, middle)) / 2
  end
end
