defmodule StabileoMarketing.Ads.Report do
  @moduledoc """
  Turns stored ad rows into what the Publicidad page shows. Pure: it takes
  rows and returns plain maps with floats.

  Amounts are converted from each account's currency to `display` ("USD" or
  "ARS") with the fx rate of the row's day, or the closest earlier one.
  `signups` and `activations` are what the platform attributes to its ads;
  `accounts` and `activated` are the accounts our own database says came from
  them (`StabileoMarketing.Ads.Attribution`), which a blocker or a declined
  cookie cannot hide. Unique clicks, sign-up clicks and activations are nil
  when no row measures them.
  """

  alias StabileoMarketing.Ads.Goals

  @count_fields [:impressions, :reach, :clicks, :signups, :results]
  @optional_fields [:unique_clicks, :signup_clicks, :activations]
  @goal_metrics ~w(signups activations clicks)

  def totals(rows, ctx), do: rows |> sum(ctx) |> finish()

  def kpis(current_rows, previous_rows, current_budgets, previous_budgets, ctx) do
    %{
      current: current_rows |> sum(ctx) |> with_budget(current_budgets, ctx) |> finish(),
      previous: previous_rows |> sum(ctx) |> with_budget(previous_budgets, ctx) |> finish()
    }
  end

  @doc "One point per day of `range`; `in_period` tells the days of `period` from the ones added for context."
  def daily(rows, range, ctx, period \\ nil) do
    period = period || range
    by_date = Enum.group_by(rows, & &1.date)

    Enum.map(range, fn date ->
      by_date
      |> Map.get(date, [])
      |> sum(ctx)
      |> finish()
      |> Map.merge(%{date: Date.to_iso8601(date), in_period: date in period})
    end)
  end

  @manager_pages %{"campaign" => "campaigns", "ad_group" => "adsets", "ad" => "ads"}
  @manager_ids %{"campaign" => "selected_campaign_ids", "ad_group" => "selected_adset_ids", "ad" => "selected_ad_ids"}

  defp creative(entity), do: Map.get(entity, :creative) || %{}

  defp links(entity, channel, account) do
    creative = creative(entity)

    %{
      manager: manager_url(channel, account, entity.level, entity.external_id),
      preview: creative["preview_url"],
      instagram: creative["instagram_url"],
      facebook: creative["facebook_url"]
    }
  end

  defp manager_url("meta", "act_" <> account, level, id) do
    query = URI.encode_query(%{"act" => account, @manager_ids[level] => id})
    "https://adsmanager.facebook.com/adsmanager/manage/#{@manager_pages[level]}?#{query}"
  end

  defp manager_url(_channel, _account, _level, _id), do: nil

  @doc """
  One row per entity with its totals; results are those of its most recent
  result type. `accounts_of` answers an entity's accounts from our database.
  """
  def by_entity(rows, entities, ctx, accounts_of \\ fn _entity -> nil end) do
    account_of = Map.new(ctx.accounts, &{&1.id, &1})
    totals = Enum.group_by(rows, &{&1.ad_account_id, &1.external_id})

    entities
    |> Enum.map(fn entity ->
      group = Map.get(totals, {entity.ad_account_id, entity.external_id}, [])
      {result_type, results} = latest_results(group)
      row = group |> sum(ctx) |> finish()
      account = account_of[entity.ad_account_id] || %{}
      ours = accounts_of.(entity) || %{accounts: 0, activated: 0}

      Map.merge(row, %{
        id: entity.id,
        ad_account_id: entity.ad_account_id,
        level: entity.level,
        external_id: entity.external_id,
        campaign_external_id: entity.campaign_external_id,
        ad_group_external_id: Map.get(entity, :ad_group_external_id),
        channel: account[:channel],
        name: entity.name,
        status: entity.status,
        objective: entity.objective,
        goal: get_in(Map.get(entity, :details) || %{}, ["goal"]),
        daily_budget: money(entity.daily_budget, entity.ad_account_id, ctx.today, ctx),
        result_type: result_type,
        results: results,
        cost_per_result: ratio(row.spend, results),
        accounts: ours.accounts,
        activated: ours.activated,
        cost_per_account: ratio(row.spend, ours.accounts),
        cost_per_activated: ratio(row.spend, ours.activated),
        thumbnail_url: creative(entity)["thumbnail_url"],
        format: creative(entity)["format"],
        links: links(entity, account[:channel], account[:external_id])
      })
    end)
    |> Enum.sort_by(&{-&1.spend, &1.name || ""})
  end

  @doc "Campaigns with their ad groups, and those with their ads. Only what spent in the period is listed."
  def tree(rows, entities, ctx, accounts_of) do
    [campaigns, ad_groups, ads] =
      for level <- [:campaign, :ad_group, :ad] do
        rows
        |> Map.fetch!(level)
        |> by_entity(Map.fetch!(entities, level), ctx, accounts_of)
        |> Enum.filter(&(&1.spend > 0))
      end

    ads_of = Enum.group_by(ads, &{&1.ad_account_id, &1.ad_group_external_id})
    groups_of = Enum.group_by(ad_groups, &{&1.ad_account_id, &1.campaign_external_id})

    Enum.map(campaigns, fn campaign ->
      children =
        groups_of
        |> Map.get({campaign.ad_account_id, campaign.external_id}, [])
        |> Enum.map(fn group ->
          Map.put(group, :children, Map.get(ads_of, {group.ad_account_id, group.external_id}, []))
        end)

      Map.put(campaign, :children, children)
    end)
  end

  @doc """
  Each goal's cost counting only the spend of the campaigns that pursue it:
  per goal, that spend, what those campaigns brought (`count`), what other
  campaigns brought along the way (`other`) and `cost`. A Google campaign
  bidding on every conversion shares its spend among the sign-ups and
  activations it brought. Spend on reach, or on campaigns whose goal is
  unknown, is charged to no goal (`unassigned`).
  """
  def goal_costs(rows, campaigns, ctx), do: charge_goals(rows, campaign_goals(rows, campaigns), ctx)

  defp campaign_goals(rows, campaigns) do
    types =
      rows
      |> Enum.sort_by(& &1.date, Date)
      |> Enum.group_by(&{&1.ad_account_id, &1.external_id}, &Map.get(&1, :result_type))

    Map.new(campaigns, fn campaign ->
      key = {campaign.ad_account_id, campaign.external_id}
      {key, Goals.resolve(campaign, Map.get(types, key, []))}
    end)
  end

  defp charge_goals(rows, goal_of, ctx) do
    start = %{
      metrics: Map.new(@goal_metrics, &{&1, %{spend: 0.0, count: 0.0, total: 0.0}}),
      unassigned: %{awareness: 0.0, other: 0.0}
    }

    rows
    |> Enum.group_by(&{&1.ad_account_id, &1.external_id})
    |> Enum.reduce(start, fn {key, days}, acc ->
      totals = days |> sum(ctx) |> finish()
      values = %{"signups" => totals.signups, "activations" => totals.activations || 0.0, "clicks" => totals.clicks}

      acc
      |> update_in([:metrics], &add_totals(&1, values))
      |> charge(Map.get(goal_of, key), totals.spend, values)
    end)
    |> then(fn %{metrics: metrics, unassigned: unassigned} ->
      %{
        metrics:
          Map.new(metrics, fn {metric, entry} ->
            {metric,
             %{
               spend: Float.round(entry.spend, 2),
               count: entry.count,
               other: max(entry.total - entry.count, 0.0),
               cost: ratio(entry.spend, entry.count)
             }}
          end),
        unassigned: Map.new(unassigned, fn {key, spend} -> {key, Float.round(spend, 2)} end)
      }
    end)
  end

  defp add_totals(metrics, values),
    do: Map.new(metrics, fn {metric, entry} -> {metric, %{entry | total: entry.total + values[metric]}} end)

  defp charge(acc, goal, spend, values) when goal in @goal_metrics, do: add_charge(acc, goal, spend, values[goal])

  defp charge(acc, "conversions", spend, values) do
    case values["signups"] + values["activations"] do
      none when none == 0 ->
        update_in(acc, [:unassigned, :other], &(&1 + spend))

      brought ->
        acc
        |> add_charge("signups", spend * values["signups"] / brought, values["signups"])
        |> add_charge("activations", spend * values["activations"] / brought, values["activations"])
    end
  end

  defp charge(acc, "awareness", spend, _values), do: update_in(acc, [:unassigned, :awareness], &(&1 + spend))
  defp charge(acc, _unknown, spend, _values), do: update_in(acc, [:unassigned, :other], &(&1 + spend))

  defp add_charge(acc, metric, spend, count) do
    update_in(acc, [:metrics, metric], fn entry -> %{entry | spend: entry.spend + spend, count: entry.count + count} end)
  end

  @doc "Whether an amount had to be converted without any fx rate; those amounts count as zero."
  def fx_missing?(%{fx: fx, display: display, accounts: accounts}),
    do: fx == %{} and Enum.any?(accounts, &((&1.currency || "USD") != display))

  @doc "The daily budget of the campaigns active today, and how many they are."
  def today_budget(campaigns, ctx) do
    active = Enum.filter(campaigns, &(&1.status == "active"))

    %{
      active_campaigns: length(active),
      daily_budget:
        active
        |> Enum.map(&money_decimal(&1.daily_budget, &1.ad_account_id, ctx.today, ctx))
        |> Enum.reduce(Decimal.new(0), &Decimal.add/2)
        |> round_money()
    }
  end

  def conversions(rows) do
    rows
    |> Enum.group_by(& &1.conversion_key)
    |> Enum.map(fn {key, [first | _] = group} ->
      %{
        key: key,
        name: first.conversion_name,
        group: first.conversion_group,
        count: group |> Enum.map(& &1.count) |> Enum.reduce(Decimal.new(0), &Decimal.add/2) |> Decimal.to_float()
      }
    end)
    |> Enum.sort_by(& &1.count, :desc)
  end

  def previous_range(%Date.Range{first: first, last: last}) do
    days = Date.diff(last, first) + 1
    Date.range(Date.add(first, -days), Date.add(first, -1))
  end

  @doc "The range the daily chart draws: the period, widened to at least `min_days`."
  def chart_range(%Date.Range{first: first, last: last}, min_days),
    do: Date.range(Enum.min([first, Date.add(last, -(min_days - 1))], Date), last)

  defp rate_on(fx, date), do: Map.get(fx, date) || closest_rate(fx, date)

  defp closest_rate(fx, date) do
    earlier = Enum.filter(fx, fn {day, _rate} -> Date.compare(day, date) != :gt end)

    picked =
      if earlier == [],
        do: Enum.min_by(fx, fn {day, _rate} -> day end, Date, fn -> nil end),
        else: Enum.max_by(earlier, fn {day, _rate} -> day end, Date, fn -> nil end)

    case picked do
      {_day, rate} -> rate
      nil -> nil
    end
  end

  defp latest_results([]), do: {nil, 0.0}

  defp latest_results(rows) do
    typed = Enum.filter(rows, &(Map.get(&1, :result_type) not in [nil, ""]))

    case Enum.max_by(typed, & &1.date, Date, fn -> nil end) do
      nil ->
        {nil, 0.0}

      %{result_type: type} ->
        {type,
         typed
         |> Enum.filter(&(&1.result_type == type))
         |> Enum.map(&(&1.results || Decimal.new(0)))
         |> Enum.reduce(Decimal.new(0), &Decimal.add/2)
         |> Decimal.to_float()}
    end
  end

  defp sum(rows, ctx) do
    zero = Decimal.new(0)

    start =
      [:spend | @count_fields]
      |> Map.new(&{&1, zero})
      |> Map.merge(Map.new(@optional_fields, &{&1, nil}))

    Enum.reduce(rows, start, fn row, acc ->
      acc
      |> Map.update!(:spend, &Decimal.add(&1, money_decimal(row.spend, row.ad_account_id, row.date, ctx)))
      |> add_counts(row)
      |> add_optional(row)
    end)
  end

  defp add_counts(acc, row) do
    Enum.reduce(@count_fields, acc, fn field, acc ->
      case Map.get(row, field) do
        nil -> acc
        value -> Map.update!(acc, field, &Decimal.add(&1, value))
      end
    end)
  end

  defp add_optional(acc, row) do
    Enum.reduce(@optional_fields, acc, fn field, acc ->
      case Map.get(row, field) do
        %Decimal{} = value -> Map.update!(acc, field, &Decimal.add(&1 || Decimal.new(0), value))
        _ -> acc
      end
    end)
  end

  defp with_budget(acc, budgets, ctx) do
    budget =
      budgets
      |> Enum.map(&money_decimal(&1.budget, &1.ad_account_id, &1.date, ctx))
      |> Enum.reduce(Decimal.new(0), &Decimal.add/2)

    Map.put(acc, :budget, budget)
  end

  defp finish(acc) do
    spend = round_money(acc.spend)
    counts = Map.new(@count_fields, fn field -> {field, Decimal.to_float(acc[field])} end)
    optional = Map.new(@optional_fields, fn field -> {field, acc[field] && Decimal.to_float(acc[field])} end)

    base =
      counts
      |> Map.merge(optional)
      |> Map.merge(%{
        spend: spend,
        ctr: ratio(counts.clicks, counts.impressions),
        cpm: ratio(spend * 1000, counts.impressions),
        cpc: ratio(spend, counts.clicks),
        cost_per_signup: ratio(spend, counts.signups),
        cost_per_activation: ratio(spend, optional.activations),
        signup_rate: ratio(counts.signups, optional.signup_clicks)
      })

    case acc do
      %{budget: budget} ->
        budget = round_money(budget)
        Map.merge(base, %{budget: budget, budget_executed: ratio(spend, budget)})

      _ ->
        base
    end
  end

  defp money(nil, _account_id, _date, _ctx), do: nil
  defp money(amount, account_id, date, ctx), do: amount |> money_decimal(account_id, date, ctx) |> round_money()

  defp money_decimal(nil, _account_id, _date, _ctx), do: Decimal.new(0)

  defp money_decimal(amount, account_id, date, ctx) do
    currency = Enum.find_value(ctx.accounts, "USD", &(&1.id == account_id && (&1.currency || "USD")))
    convert(amount, currency, ctx.display, fn -> rate_on(ctx.fx, date) end)
  end

  defp convert(amount, same, same, _rate), do: amount

  defp convert(amount, from, to, rate) when {from, to} in [{"ARS", "USD"}, {"USD", "ARS"}] do
    case {rate.(), from} do
      {nil, _from} -> Decimal.new(0)
      {rate, "ARS"} -> Decimal.div(amount, rate)
      {rate, "USD"} -> Decimal.mult(amount, rate)
    end
  end

  defp convert(amount, _from, _to, _rate), do: amount

  defp round_money(decimal), do: decimal |> Decimal.round(2) |> Decimal.to_float()

  defp ratio(_numerator, denominator) when denominator in [0, 0.0, nil], do: nil
  defp ratio(numerator, denominator), do: numerator / denominator
end
