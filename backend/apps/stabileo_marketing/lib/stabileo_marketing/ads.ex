defmodule StabileoMarketing.Ads do
  @moduledoc """
  The ad reporting behind the admin's Publicidad page: the Meta and Google
  Ads accounts saved in Settings, their sync, and the overview built from
  what the sync stored and from the accounts our database attributes to
  each ad.

  Accounts are created from the saved ids on first use. Only the accounts
  saved now are listed: an id replaced in Settings keeps its rows but stops
  being reported and synced. How often they sync is the `ads_sync` setting.
  Days are Buenos Aires days (UTC-3, no daylight saving), the ones the
  platforms report the accounts in.
  """

  import Ecto.Query

  alias StabileoMarketing.Ads.{Attribution, Report}
  alias StabileoMarketing.Configs
  alias StabileoMarketing.Workers.AdsSyncWorker
  alias StabileoRepo.{Repo, SystemSettings}

  alias StabileoRepo.Schemas.{AdAccount, AdDailyBudget, AdDailyMetric, AdEntity, AdFxRate}

  @settings_key "ads_sync"
  @default_interval 30
  @interval_range 5..1440
  @displays ~w(USD ARS)
  @channels ~w(meta google)
  @chart_min_days 7
  @offset_seconds -3 * 3600

  def displays, do: @displays
  def channels, do: @channels
  def interval_range, do: @interval_range

  @doc "The accounts saved in Settings, created on first use."
  def accounts do
    for {channel, id} <- [{"meta", Configs.meta_ad_account_id()}, {"google", Configs.google_ads_customer_id()}],
        is_binary(id) do
      %AdAccount{}
      |> AdAccount.changeset(%{channel: channel, external_id: id, sync_status: "pending"})
      |> Repo.insert(on_conflict: :nothing, conflict_target: [:channel, :external_id])

      Repo.get_by!(AdAccount, channel: channel, external_id: id)
    end
  end

  def sync_interval_minutes do
    case SystemSettings.get(@settings_key) do
      %{"interval_minutes" => minutes} when is_integer(minutes) -> minutes
      _ -> @default_interval
    end
  end

  def set_sync_interval_minutes(minutes) when is_integer(minutes) and minutes in @interval_range do
    with {:ok, _setting} <-
           SystemSettings.set(@settings_key, %{"interval_minutes" => minutes}, "Minutes between ad account syncs") do
      {:ok, minutes}
    end
  end

  def set_sync_interval_minutes(_minutes), do: {:error, {:validation, %{interval_minutes: ["must be a whole number from 5 to 1440"]}}}

  def due_accounts(now) do
    cutoff = DateTime.add(now, -sync_interval_minutes() * 60, :second)

    Enum.filter(accounts(), fn account ->
      is_nil(account.last_synced_at) or DateTime.compare(account.last_synced_at, cutoff) != :gt
    end)
  end

  def enqueue_sync(accounts) do
    accounts
    |> Enum.map(&(%{"ad_account_id" => &1.id} |> AdsSyncWorker.new() |> Oban.insert()))
    |> Enum.count(&match?({:ok, _}, &1))
  end

  @doc "Today in Buenos Aires."
  def today(now \\ DateTime.utc_now()), do: local_date(now)

  def local_date(%DateTime{} = at), do: at |> DateTime.add(@offset_seconds) |> DateTime.to_date()
  def local_date(%NaiveDateTime{} = at), do: at |> NaiveDateTime.add(@offset_seconds) |> NaiveDateTime.to_date()

  @doc "The UTC instants a range of Buenos Aires days starts and ends at (end exclusive)."
  def utc_bounds(%Date.Range{first: first, last: last}) do
    start = DateTime.new!(first, ~T[03:00:00], "Etc/UTC")
    {start, DateTime.new!(Date.add(last, 1), ~T[03:00:00], "Etc/UTC")}
  end

  @doc "The last day the accounts have numbers for, or `today` when they have none."
  def last_data_on(account_ids, today) do
    Repo.one(from(m in AdDailyMetric, where: m.ad_account_id in ^account_ids, select: max(m.date))) || today
  end

  @doc """
  `opts`: `channel` ("all", "meta" or "google"), `range` (a `Date.Range` or
  `{:last_days, n}`, which ends on the last day with numbers), `display`
  ("USD" or "ARS") and `today`.
  """
  def overview(opts) do
    accounts = Enum.filter(accounts(), &(opts.channel in ["all", &1.channel]))
    ids = Enum.map(accounts, & &1.id)
    range = resolve_range(opts.range, ids, opts.today)
    previous = Report.previous_range(range)
    chart = Report.chart_range(range, @chart_min_days)
    from = Enum.min([previous.first, chart.first], Date)
    channels = if opts.channel == "all", do: @channels, else: [opts.channel]

    metrics = level_metrics(ids, "campaign", from, range.last)
    current = Enum.filter(metrics, &(&1.date in range))
    budgets = budgets(ids, previous.first, range.last)
    ctx = context(accounts, opts)
    entities = entities(ids)

    sources = Attribution.sources(Date.range(from, range.last))
    in_range = fn period -> Enum.filter(sources, &(local_date(&1.day) in period)) end
    accounts_of = Attribution.counter(in_range.(range), Map.new(accounts, &{&1.id, &1.channel}))
    per_day = Attribution.by_day(sources, channels)

    kpis =
      current
      |> Report.kpis(
        Enum.filter(metrics, &(&1.date in previous)),
        Enum.filter(budgets, &(&1.date in range)),
        Enum.filter(budgets, &(&1.date in previous)),
        ctx
      )
      |> with_ours(:current, Attribution.totals(in_range.(range), channels))
      |> with_ours(:previous, Attribution.totals(in_range.(previous), channels))

    %{
      accounts: Enum.map(accounts, &account_json/1),
      sync_interval_minutes: sync_interval_minutes(),
      period: %{
        from: range.first,
        to: range.last,
        days: Date.diff(range.last, range.first) + 1,
        last_data_on: last_data_on(ids, opts.today)
      },
      display: opts.display,
      kpis: Map.put(kpis, :today, Report.today_budget(entities.campaign, ctx)),
      daily:
        metrics
        |> Enum.filter(&(&1.date in chart))
        |> Report.daily(chart, ctx, range)
        |> Enum.map(fn day ->
          ours = Map.get(per_day, Date.from_iso8601!(day.date), %{accounts: 0, activated: 0})
          Map.merge(day, ours)
        end),
      goals: Report.goal_costs(current, entities.campaign, ctx),
      tree:
        Report.tree(
          %{
            campaign: current,
            ad_group: level_metrics(ids, "ad_group", range.first, range.last),
            ad: level_metrics(ids, "ad", range.first, range.last)
          },
          entities,
          ctx,
          accounts_of
        ),
      fx_missing: Report.fx_missing?(ctx)
    }
  end

  defp with_ours(kpis, key, ours) do
    Map.update!(kpis, key, fn row ->
      Map.merge(row, %{
        accounts: ours.accounts,
        activated: ours.activated,
        cost_per_account: ratio(row.spend, ours.accounts),
        cost_per_activated: ratio(row.spend, ours.activated)
      })
    end)
  end

  defp ratio(_numerator, 0), do: nil
  defp ratio(numerator, denominator), do: numerator / denominator

  defp resolve_range({:last_days, days}, account_ids, today) do
    last = last_data_on(account_ids, today)
    Date.range(Date.add(last, -(days - 1)), last)
  end

  defp resolve_range(%Date.Range{} = range, _account_ids, _today), do: range

  defp context(accounts, opts) do
    %{
      accounts: Enum.map(accounts, &%{id: &1.id, channel: &1.channel, external_id: &1.external_id, currency: &1.currency}),
      fx: AdFxRate |> Repo.all() |> Map.new(&{&1.date, &1.usd_ars}),
      display: opts.display,
      today: opts.today
    }
  end

  defp level_metrics(ids, level, from, to) do
    Repo.all(
      from(m in AdDailyMetric,
        where: m.ad_account_id in ^ids and m.level == ^level and m.date >= ^from and m.date <= ^to
      )
    )
  end

  defp entities(ids) do
    by_level = from(e in AdEntity, where: e.ad_account_id in ^ids) |> Repo.all() |> Enum.group_by(& &1.level)

    %{
      campaign: Map.get(by_level, "campaign", []),
      ad_group: Map.get(by_level, "ad_group", []),
      ad: Map.get(by_level, "ad", [])
    }
  end

  defp budgets(ids, from, to) do
    Repo.all(from(b in AdDailyBudget, where: b.ad_account_id in ^ids and b.date >= ^from and b.date <= ^to))
  end

  def account_json(account) do
    %{
      id: account.id,
      channel: account.channel,
      name: account.name,
      external_id: account.external_id,
      currency: account.currency,
      sync_status: account.sync_status,
      last_synced_at: account.last_synced_at,
      last_sync_error: account.last_sync_error
    }
  end
end
