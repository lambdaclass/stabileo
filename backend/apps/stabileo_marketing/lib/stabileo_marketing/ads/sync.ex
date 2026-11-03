defmodule StabileoMarketing.Ads.Sync do
  @moduledoc """
  Downloads one ad account and stores it. The first sync goes back
  `history_days` (180 by default); later ones redo the last `refresh_days`
  (7), which the platforms keep correcting. The days a sync downloads replace
  what was stored for them, except that an estimated budget never replaces an
  exact one; fx rates of other days are kept.
  """

  import Ecto.Query

  alias StabileoMarketing.Ads
  alias StabileoMarketing.Ads.{FxRates, Source, Sources}
  alias StabileoRepo.Repo

  alias StabileoRepo.Schemas.{
    AdAccount,
    AdDailyBudget,
    AdDailyConversion,
    AdDailyMetric,
    AdEntity,
    AdFxRate
  }

  @default_refresh_days 7
  @default_history_days 180

  def run(%AdAccount{} = account, now) do
    today = Ads.today(now)
    range = Date.range(first_day(account, today), today)

    case source(account).fetch(account, range, today) do
      {:ok, snapshot} ->
        store(account, snapshot, range, now)

      {:error, :not_connected} ->
        mark(account, %{sync_status: "not_connected", last_sync_error: nil})

      {:error, reason} ->
        mark(account, %{sync_status: "error", last_sync_error: Source.describe_error(reason)})
        {:error, reason}
    end
  end

  def source(%AdAccount{channel: "meta"}), do: Application.get_env(:stabileo_marketing, :meta_source, Sources.Meta)
  def source(%AdAccount{channel: "google"}), do: Application.get_env(:stabileo_marketing, :google_source, Sources.Google)

  defp config, do: Application.get_env(:stabileo_marketing, :ads, [])

  defp first_day(%AdAccount{last_synced_at: nil}, today),
    do: Date.add(today, -((config()[:history_days] || @default_history_days) - 1))

  defp first_day(_account, today),
    do: Date.add(today, -((config()[:refresh_days] || @default_refresh_days) - 1))

  defp store(account, snapshot, range, now) do
    fx_rates =
      case FxRates.fetch(range) do
        {:ok, rates} -> rates
        {:error, _} -> []
      end

    Repo.transaction(fn ->
      replace(AdDailyMetric, account, range, snapshot.metrics, &metric_row/2)
      replace(AdDailyConversion, account, range, snapshot.conversions, &conversion_row/2)
      replace_budgets(account, range, snapshot.budgets)
      upsert_entities(account, snapshot.entities, now)
      upsert_fx(fx_rates)

      account
      |> AdAccount.changeset(%{
        name: snapshot.account[:name] || account.name,
        currency: snapshot.account[:currency] || account.currency,
        sync_status: "ok",
        last_synced_at: DateTime.truncate(now, :second),
        last_sync_error: nil
      })
      |> Repo.update!()
    end)
  end

  defp replace(schema, account, range, rows, to_row) do
    Repo.delete_all(
      from(r in schema,
        where: r.ad_account_id == ^account.id and r.date >= ^range.first and r.date <= ^range.last
      )
    )

    rows
    |> Enum.filter(&(&1.date in range))
    |> Enum.map(&Map.put(to_row.(&1, account.id), :id, Ecto.UUID.generate()))
    |> Enum.uniq_by(&unique_key(schema, &1))
    |> Enum.chunk_every(1_000)
    |> Enum.each(&Repo.insert_all(schema, &1))
  end

  defp replace_budgets(account, range, budgets) do
    estimated = for %{estimated: true} = row <- budgets, into: MapSet.new(), do: budget_key(row)

    kept =
      from(b in AdDailyBudget,
        where:
          b.ad_account_id == ^account.id and b.date >= ^range.first and b.date <= ^range.last and
            not b.estimated,
        select: %{id: b.id, date: b.date, campaign_external_id: b.campaign_external_id}
      )
      |> Repo.all()
      |> Enum.filter(&MapSet.member?(estimated, budget_key(&1)))

    kept_keys = MapSet.new(kept, &budget_key/1)
    kept_ids = Enum.map(kept, & &1.id)

    Repo.delete_all(
      from(b in AdDailyBudget,
        where:
          b.ad_account_id == ^account.id and b.date >= ^range.first and b.date <= ^range.last and
            b.id not in ^kept_ids
      )
    )

    budgets
    |> Enum.reject(&MapSet.member?(kept_keys, budget_key(&1)))
    |> Enum.filter(&(&1.date in range))
    |> Enum.map(&Map.put(budget_row(&1, account.id), :id, Ecto.UUID.generate()))
    |> Enum.uniq_by(&unique_key(AdDailyBudget, &1))
    |> Enum.chunk_every(1_000)
    |> Enum.each(&Repo.insert_all(AdDailyBudget, &1))
  end

  defp budget_key(row), do: {row.date, to_string(row.campaign_external_id)}

  defp unique_key(AdDailyMetric, row), do: {row.level, row.external_id, row.date}
  defp unique_key(AdDailyConversion, row), do: {row.level, row.external_id, row.date, row.conversion_key}
  defp unique_key(AdDailyBudget, row), do: {row.date, row.campaign_external_id}

  defp metric_row(metric, account_id) do
    zero = Decimal.new(0)

    AdDailyMetric.metrics()
    |> Map.new(&{&1, Map.get(metric, &1) || zero})
    |> Map.merge(Map.new(AdDailyMetric.optional_metrics(), &{&1, Map.get(metric, &1)}))
    |> Map.merge(%{
      ad_account_id: account_id,
      date: metric.date,
      level: metric.level,
      external_id: to_string(metric.external_id),
      campaign_external_id: string_or_nil(metric[:campaign_external_id]),
      ad_group_external_id: string_or_nil(metric[:ad_group_external_id]),
      result_type: metric[:result_type]
    })
  end

  defp conversion_row(conversion, account_id) do
    %{
      ad_account_id: account_id,
      date: conversion.date,
      level: conversion.level,
      external_id: to_string(conversion.external_id),
      campaign_external_id: string_or_nil(conversion[:campaign_external_id]),
      conversion_key: conversion.conversion_key,
      conversion_name: conversion[:conversion_name],
      conversion_group: conversion[:conversion_group],
      count: conversion.count
    }
  end

  defp budget_row(budget, account_id) do
    %{
      ad_account_id: account_id,
      date: budget.date,
      campaign_external_id: to_string(budget.campaign_external_id),
      budget: budget.budget,
      estimated: budget[:estimated] == true
    }
  end

  defp upsert_entities(account, entities, now) do
    timestamp = DateTime.truncate(now, :second)

    entities
    |> Enum.reject(&is_nil(&1.external_id))
    |> Enum.map(fn entity ->
      %{
        id: Ecto.UUID.generate(),
        ad_account_id: account.id,
        level: entity.level,
        external_id: to_string(entity.external_id),
        campaign_external_id: string_or_nil(entity[:campaign_external_id]),
        ad_group_external_id: string_or_nil(entity[:ad_group_external_id]),
        name: entity[:name],
        status: entity[:status],
        objective: entity[:objective],
        daily_budget: entity[:daily_budget],
        lifetime_budget: entity[:lifetime_budget],
        starts_on: entity[:starts_on],
        ends_on: entity[:ends_on],
        creative: entity[:creative],
        details: entity[:details],
        inserted_at: timestamp,
        updated_at: timestamp
      }
    end)
    |> Enum.uniq_by(&{&1.level, &1.external_id})
    |> Enum.chunk_every(1_000)
    |> Enum.each(
      &Repo.insert_all(AdEntity, &1,
        on_conflict:
          {:replace,
           [
             :campaign_external_id,
             :ad_group_external_id,
             :name,
             :status,
             :objective,
             :daily_budget,
             :lifetime_budget,
             :starts_on,
             :ends_on,
             :creative,
             :details,
             :updated_at
           ]},
        conflict_target: [:ad_account_id, :level, :external_id]
      )
    )
  end

  defp upsert_fx([]), do: :ok

  defp upsert_fx(rates) do
    rates
    |> Enum.uniq_by(& &1.date)
    |> Enum.chunk_every(1_000)
    |> Enum.each(&Repo.insert_all(AdFxRate, &1, on_conflict: {:replace, [:usd_ars]}, conflict_target: [:date]))
  end

  defp mark(account, attrs), do: account |> AdAccount.changeset(attrs) |> Repo.update()

  defp string_or_nil(nil), do: nil
  defp string_or_nil(""), do: nil
  defp string_or_nil(value), do: to_string(value)
end
