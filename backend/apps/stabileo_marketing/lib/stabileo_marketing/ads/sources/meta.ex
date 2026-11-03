defmodule StabileoMarketing.Ads.Sources.Meta do
  @moduledoc """
  Reads a Meta Ads account through the Marketing API: campaigns, ad sets and
  ads with their status and budgets, and daily insights per level, with the
  Marketing API token (`ads_read`) saved in Settings.

  Each metric is read the way Ads Manager shows it: Meta applies every ad
  set's own attribution setting and dates each conversion by its impression,
  `results` is the ad set's own result, and a pixel event Meta reports both as
  an action and as a conversion counts once.

  Custom pixel events reach the insights only through a custom conversion
  created on them in Events Manager, as `offsite_conversion.custom.<id>`. The
  ones whose rule is the app's `SignUpClick` count as sign-up clicks and the
  ones on `FirstSave` as activations. Without them, or when the custom
  conversions cannot be read, those two are nil: not measured.

  Budgets come in the currency's minor unit and are divided by 100. The budget
  each campaign had on every day is rebuilt from the account's activity log.
  """

  @behaviour StabileoMarketing.Ads.Source

  alias StabileoMarketing.Ads.{Goals, Source}
  alias StabileoMarketing.{Configs, HttpClient}
  alias StabileoRepo.Schemas.AdAccount

  @version "v24.0"

  @statuses ~w(ACTIVE PAUSED CAMPAIGN_PAUSED ADSET_PAUSED ARCHIVED DELETED IN_PROCESS PENDING_REVIEW WITH_ISSUES DISAPPROVED)

  @signup_types ["complete_registration", "omni_complete_registration"]
  @signup_pixel "offsite_conversion.fb_pixel_complete_registration"
  @custom_events %{"signupclick" => :signup_click, "firstsave" => :activation}
  @matching_operators ~w(eq i_eq contains i_contains starts_with i_starts_with)

  @impl true
  def fetch(%AdAccount{external_id: account_id}, range, _today) do
    with {:ok, token} <- token(),
         get = &get_all(&1, token),
         {:ok, [info]} <- get.("#{account_id}?fields=name,currency"),
         {:ok, campaigns} <-
           get.(
             "#{account_id}/campaigns?fields=id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,created_time,bid_strategy&limit=500&#{all_statuses()}"
           ),
         {:ok, ad_sets} <-
           get.(
             "#{account_id}/adsets?fields=id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,start_time,end_time,created_time,optimization_goal,promoted_object,targeting%7Bage_min,age_max,geo_locations%7D&limit=500&#{all_statuses()}"
           ),
         {:ok, ads} <-
           get.(
             "#{account_id}/ads?fields=id,name,adset_id,campaign_id,effective_status,preview_shareable_link,creative%7Bthumbnail_url,title,body,object_type,video_id,call_to_action_type,object_story_spec,asset_feed_spec,instagram_permalink_url,effective_object_story_id%7D&limit=500&#{all_statuses()}"
           ),
         custom = custom_conversions(get, account_id),
         {:ok, metrics} <- level_insights(get, account_id, range, custom),
         {:ok, activities} <-
           get.(
             "#{account_id}/activities?fields=event_type,event_time,object_id,extra_data&limit=500&since=#{Date.add(range.first, -1)}"
           ) do
      ad_set_budgets = ad_set_budgets(ad_sets)
      ad_set_goals = ad_set_goals(ad_sets, custom)

      {:ok,
       %{
         account: %{name: info["name"], currency: info["currency"]},
         entities:
           Enum.map(campaigns, &campaign(&1, ad_set_budgets, ad_set_goals)) ++
             Enum.map(ad_sets, &ad_set(&1, custom)) ++ Enum.map(ads, &ad/1),
         metrics: Enum.map(metrics, &elem(&1, 0)),
         conversions: Enum.flat_map(metrics, &elem(&1, 1)),
         budgets: budgets(campaigns, ad_sets, activities, range)
       }}
    end
  end

  @impl true
  def check(%AdAccount{external_id: account_id}) do
    case token() do
      {:ok, token} ->
        [Source.step("credentials", :ok) | read_steps(account_id, token)]

      {:error, :not_connected} ->
        [
          Source.step("credentials", :error),
          Source.step("account", :skipped),
          Source.step("insights", :skipped)
        ]
    end
  end

  defp read_steps(account_id, token) do
    case get_all("#{account_id}?fields=name,currency", token) do
      {:ok, [info]} ->
        [
          Source.step("account", :ok, "#{info["name"]} (#{info["currency"]})"),
          insights_step(account_id, token)
        ]

      {:ok, _other} ->
        [Source.step("account", :error, "Meta returned no account"), Source.step("insights", :skipped)]

      {:error, reason} ->
        [
          Source.step("account", :error, Source.describe_error(reason)),
          Source.step("insights", :skipped)
        ]
    end
  end

  defp insights_step(account_id, token) do
    case get_all("#{account_id}/insights?date_preset=last_7d&fields=spend&limit=1", token) do
      {:ok, _rows} -> Source.step("insights", :ok)
      {:error, reason} -> Source.step("insights", :error, Source.describe_error(reason))
    end
  end

  defp all_statuses do
    "filtering=" <>
      URI.encode_www_form(
        Jason.encode!([%{field: "effective_status", operator: "IN", value: @statuses}])
      )
  end

  defp token do
    case Configs.meta_ads_access_token() do
      token when is_binary(token) -> {:ok, token}
      _ -> {:error, :not_connected}
    end
  end

  defp get_all(path, token), do: get_pages("https://graph.facebook.com/#{@version}/#{path}", token, [])

  defp get_pages(url, token, acc) do
    case HttpClient.get_json(url, [{"Authorization", "Bearer #{token}"}]) do
      {:ok, %{"data" => data} = body} when is_list(data) ->
        case get_in(body, ["paging", "next"]) do
          next when is_binary(next) -> get_pages(next, token, acc ++ data)
          _ -> {:ok, acc ++ data}
        end

      {:ok, %{} = single} ->
        {:ok, acc ++ [single]}

      {:error, _} = error ->
        error
    end
  end

  defp insights_path(account_id, range, extra) do
    time_range =
      Jason.encode!(%{since: Date.to_iso8601(range.first), until: Date.to_iso8601(range.last)})

    "#{account_id}/insights?time_increment=1&limit=500&use_unified_attribution_setting=true&action_report_time=impression&time_range=#{URI.encode_www_form(time_range)}&#{extra}"
  end

  defp months(range) do
    range
    |> Enum.chunk_by(&{&1.year, &1.month})
    |> Enum.map(&Date.range(List.first(&1), List.last(&1)))
  end

  defp custom_conversions(get, account_id) do
    case get.("#{account_id}/customconversions?fields=id,name,rule&limit=500") do
      {:ok, rows} ->
        Map.new(rows, fn row ->
          {"offsite_conversion.custom.#{row["id"]}",
           %{id: row["id"], name: row["name"], kind: rule_kind(row["rule"])}}
        end)

      {:error, _reason} ->
        %{}
    end
  end

  defp rule_kind(rule) when is_binary(rule) do
    case Jason.decode(rule) do
      {:ok, decoded} -> Enum.find_value(@custom_events, &kind_of(decoded, &1))
      {:error, _} -> nil
    end
  end

  defp rule_kind(_rule), do: nil

  defp kind_of(rule, {event, kind}), do: if(event?(rule, event), do: kind)

  defp event?(%{"and" => rules}, event) when is_list(rules), do: Enum.any?(rules, &event?(&1, event))
  defp event?(%{"or" => [_ | _] = rules}, event), do: Enum.all?(rules, &event?(&1, event))

  defp event?(%{"event" => condition}, event) when is_map(condition) do
    Enum.any?(condition, fn {operator, value} ->
      operator in @matching_operators and is_binary(value) and String.downcase(value) == event
    end)
  end

  defp event?(_rule, _event), do: false

  defp level_insights(get, account_id, range, custom) do
    for {level, meta_level, id_field} <- [
          {"campaign", "campaign", "campaign_id"},
          {"ad_group", "adset", "adset_id"},
          {"ad", "ad", "ad_id"}
        ],
        month <- months(range),
        reduce: {:ok, []} do
      {:ok, acc} ->
        path =
          insights_path(
            account_id,
            month,
            "level=#{meta_level}&fields=campaign_id,adset_id,ad_id,spend,impressions,reach,inline_link_clicks,unique_inline_link_clicks,actions,conversions,results"
          )

        case get.(path) do
          {:ok, rows} -> {:ok, acc ++ Enum.map(rows, &insight(&1, level, id_field, custom))}
          error -> error
        end

      error ->
        error
    end
  end

  defp insight(row, level, id_field, custom) do
    actions = Map.new(row["actions"] || [], &{&1["action_type"], number(&1["value"])})
    pixel = Map.new(row["conversions"] || [], &{&1["action_type"], number(&1["value"])})
    date = Date.from_iso8601!(row["date_start"])
    external_id = row[id_field]
    {result_type, results} = result(row["results"])

    metric = %{
      date: date,
      level: level,
      external_id: external_id,
      campaign_external_id: row["campaign_id"],
      ad_group_external_id: row["adset_id"],
      spend: number(row["spend"]),
      impressions: number(row["impressions"]),
      reach: number(row["reach"]),
      clicks: Map.get(actions, "link_click") || number(row["inline_link_clicks"]),
      unique_clicks: count(row["unique_inline_link_clicks"]),
      signups: signups(actions, pixel),
      signup_clicks: custom_count(actions, custom, :signup_click),
      activations: custom_count(actions, custom, :activation),
      results: results,
      result_type: result_type
    }

    conversions =
      for {type, count} <- actions do
        %{
          date: date,
          level: level,
          external_id: external_id,
          campaign_external_id: row["campaign_id"],
          conversion_key: type,
          conversion_name: get_in(custom, [type, :name]),
          conversion_group: if(Map.has_key?(custom, type), do: "custom"),
          count: count
        }
      end

    {metric, conversions}
  end

  defp signups(actions, pixel) do
    action = Enum.find_value(@signup_types, Decimal.new(0), &Map.get(actions, &1))

    [action, Map.get(pixel, "complete_registration_website"), Map.get(actions, @signup_pixel)]
    |> Enum.reject(&is_nil/1)
    |> Enum.reduce(&Decimal.max/2)
  end

  defp result([%{"indicator" => indicator, "values" => [%{"value" => value} | _]} | _]),
    do: {indicator, number(value)}

  defp result([_empty | rest]), do: result(rest)
  defp result(_none), do: {nil, Decimal.new(0)}

  defp count(nil), do: nil

  defp count(values) when is_list(values),
    do: values |> Enum.map(&number(&1["value"])) |> Enum.reduce(Decimal.new(0), &Decimal.add/2)

  defp count(value), do: number(value)

  defp custom_count(actions, custom, kind) do
    counts = for {type, %{kind: ^kind}} <- custom, do: Map.get(actions, type, Decimal.new(0))
    if counts == [], do: nil, else: Enum.reduce(counts, &Decimal.max/2)
  end

  defp ad_set_budgets(ad_sets) do
    for %{"daily_budget" => budget, "effective_status" => "ACTIVE"} = row <- ad_sets,
        budget not in [nil, ""],
        reduce: %{} do
      acc -> Map.update(acc, row["campaign_id"], minor(budget), &Decimal.add(&1, minor(budget)))
    end
  end

  defp ad_set_goal(row, custom) do
    promoted = row["promoted_object"] || %{}

    custom_kind =
      Enum.find_value(custom, fn {_key, conversion} ->
        if conversion.id == promoted["custom_conversion_id"], do: conversion.kind
      end)

    Goals.from_meta(row["optimization_goal"], promoted["custom_event_type"], custom_kind)
  end

  defp ad_set_goals(ad_sets, custom) do
    ad_sets
    |> Enum.group_by(& &1["campaign_id"])
    |> Map.new(fn {campaign_id, sets} ->
      active = Enum.filter(sets, &(&1["effective_status"] == "ACTIVE"))
      {campaign_id, most_common_goal(if(active == [], do: sets, else: active), custom)}
    end)
  end

  defp most_common_goal(sets, custom) do
    sets
    |> Enum.map(&ad_set_goal(&1, custom))
    |> Enum.reject(&is_nil/1)
    |> Enum.frequencies()
    |> Enum.sort_by(fn {goal, count} -> {-count, goal} end)
    |> case do
      [{goal, _count} | _] -> goal
      [] -> nil
    end
  end

  defp campaign(row, ad_set_budgets, ad_set_goals) do
    %{
      level: "campaign",
      external_id: row["id"],
      campaign_external_id: row["id"],
      name: row["name"],
      status: status(row["effective_status"]),
      objective: row["objective"],
      daily_budget: minor(row["daily_budget"]) || ad_set_budgets[row["id"]],
      lifetime_budget: minor(row["lifetime_budget"]),
      details: %{
        "budget_level" => if(minor(row["daily_budget"]), do: "campaign", else: "ad_set"),
        "bid_strategy" => row["bid_strategy"],
        "goal" => ad_set_goals[row["id"]]
      },
      starts_on: date(row["start_time"]),
      ends_on: date(row["stop_time"])
    }
  end

  defp ad_set(row, custom) do
    %{
      level: "ad_group",
      external_id: row["id"],
      campaign_external_id: row["campaign_id"],
      ad_group_external_id: row["id"],
      name: row["name"],
      status: status(row["effective_status"]),
      daily_budget: minor(row["daily_budget"]),
      details: %{
        "optimization_goal" => row["optimization_goal"],
        "goal" => ad_set_goal(row, custom),
        "age_min" => get_in(row, ["targeting", "age_min"]),
        "age_max" => get_in(row, ["targeting", "age_max"]),
        "countries" => get_in(row, ["targeting", "geo_locations", "countries"])
      }
    }
  end

  defp ad(row) do
    creative = row["creative"] || %{}

    %{
      level: "ad",
      external_id: row["id"],
      campaign_external_id: row["campaign_id"],
      ad_group_external_id: row["adset_id"],
      name: row["name"],
      status: status(row["effective_status"]),
      creative: %{
        "thumbnail_url" => creative["thumbnail_url"],
        "title" => creative["title"],
        "body" => creative["body"] || story_link(creative)["message"],
        "format" => format(creative),
        "call_to_action" =>
          creative["call_to_action_type"] ||
            get_in(story_link(creative), ["call_to_action", "type"]),
        "link" => story_link(creative)["link"],
        "preview_url" => row["preview_shareable_link"],
        "instagram_url" => creative["instagram_permalink_url"],
        "facebook_url" => post_url(creative["effective_object_story_id"])
      }
    }
  end

  defp post_url(nil), do: nil
  defp post_url(story_id), do: "https://www.facebook.com/" <> story_id

  defp story_link(creative) do
    spec = creative["object_story_spec"] || %{}
    spec["link_data"] || spec["video_data"] || %{}
  end

  defp format(creative) do
    link_data = get_in(creative, ["object_story_spec", "link_data"]) || %{}

    cond do
      creative["asset_feed_spec"] -> "dynamic"
      (link_data["child_attachments"] || []) != [] -> "carousel"
      creative["video_id"] || creative["object_type"] == "VIDEO" -> "video"
      creative["object_type"] in ["PHOTO", "SHARE", "STATUS"] -> "image"
      true -> nil
    end
  end

  defp budgets(campaigns, ad_sets, activities, range) do
    history = history(activities)

    holders = Enum.flat_map(campaigns, &budget_holders(&1, ad_sets))

    for date <- range,
        {holder, campaign, parent} <- holders,
        amount = day_budget(holder, parent, history, date),
        amount != nil,
        reduce: %{} do
      acc -> Map.update(acc, {date, campaign["id"]}, amount, &Decimal.add(&1, amount))
    end
    |> Enum.map(fn {{date, campaign_id}, budget} ->
      %{date: date, campaign_external_id: campaign_id, budget: budget, estimated: false}
    end)
    |> Enum.sort_by(&{&1.date, &1.campaign_external_id}, :asc)
  end

  defp budget_holders(campaign, ad_sets) do
    if minor(campaign["daily_budget"]) || minor(campaign["lifetime_budget"]),
      do: [{campaign, campaign, nil}],
      else: for(set <- ad_sets, set["campaign_id"] == campaign["id"], do: {set, campaign, campaign})
  end

  # The accounts report days in Buenos Aires (UTC-3), so a day runs 03:00 to 02:59:59 UTC.
  defp day_budget(holder, parent, history, date) do
    day_start = DateTime.new!(date, ~T[03:00:00], "Etc/UTC")
    day_end = DateTime.add(day_start, 86_399, :second)
    starts = datetime(holder["start_time"])
    ends = datetime(holder["end_time"] || holder["stop_time"])

    if existed?(holder, history, day_start, day_end, starts, ends) and
         (running?(holder, parent, history, day_start) or running?(holder, parent, history, day_end)),
       do: amount(holder, history, day_end, starts, ends)
  end

  defp existed?(holder, history, day_start, day_end, starts, ends) do
    created = history.created[holder["id"]] || datetime(holder["created_time"])
    not (after?(created, day_end) or after?(starts, day_end) or after?(day_start, ends))
  end

  defp running?(holder, parent, history, moment),
    do: active_at?(history, holder, moment) and (parent == nil or active_at?(history, parent, moment))

  defp amount(holder, history, day_end, starts, ends) do
    lifetime = minor(holder["lifetime_budget"])

    budget =
      if lifetime && starts && ends do
        days = max(1, Date.diff(local_date(ends), local_date(starts)) + 1)
        Decimal.div(lifetime, days)
      else
        value_at(
          history.changes,
          {holder["id"], :budget},
          minor(holder["daily_budget"]) || Decimal.new(0),
          day_end
        )
      end

    if Decimal.gt?(budget, 0), do: budget
  end

  defp active_at?(history, object, moment),
    do: value_at(history.changes, {object["id"], :active}, object["status"] == "ACTIVE", moment)

  defp after?(nil, _moment), do: false
  defp after?(_moment, nil), do: false
  defp after?(a, b), do: DateTime.compare(a, b) == :gt

  defp local_date(datetime), do: datetime |> DateTime.add(-3 * 3600) |> DateTime.to_date()

  defp value_at(changes, key, current, moment) do
    case Enum.find(Map.get(changes, key, []), fn {at, _before, _after} -> after?(at, moment) end) do
      {_at, before, _after} -> before
      nil -> current
    end
  end

  defp history(activities) do
    events =
      for event <- activities,
          at = datetime(event["event_time"]),
          at != nil,
          do: {event["event_type"], event["object_id"], at, extra(event["extra_data"])}

    changes =
      events
      |> Enum.flat_map(&change/1)
      |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))
      |> Map.new(fn {key, list} -> {key, Enum.sort_by(list, &elem(&1, 0), DateTime)} end)

    created =
      for {type, id, at, _extra} <- events,
          type in ["create_ad_set", "create_campaign_group"],
          reduce: %{} do
        acc -> Map.update(acc, id, at, &Enum.min([&1, at], DateTime))
      end

    %{changes: changes, created: created}
  end

  defp change({type, id, at, extra}) when type in ["update_ad_set_budget", "update_campaign_budget"] do
    with before when is_number(before) <- get_in(extra, ["old_value", "old_value"]),
         later when is_number(later) <- get_in(extra, ["new_value", "new_value"]) do
      [{{id, :budget}, {at, minor(before), minor(later)}}]
    else
      _ -> []
    end
  end

  defp change({type, id, at, extra}) when type in ["update_ad_set_run_status", "update_campaign_run_status"] do
    case extra["run_status"] do
      %{"old_value" => before, "new_value" => later} -> [{{id, :active}, {at, before == 1, later == 1}}]
      _ -> []
    end
  end

  defp change(_event), do: []

  defp extra(json) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, %{} = map} -> map
      _ -> %{}
    end
  end

  defp extra(_none), do: %{}

  defp datetime(nil), do: nil

  defp datetime(value) do
    case DateTime.from_iso8601(Regex.replace(~r/([+-]\d\d)(\d\d)$/, value, "\\1:\\2")) do
      {:ok, datetime, _offset} -> datetime
      _ -> nil
    end
  end

  defp status("ACTIVE"), do: "active"
  defp status(status) when status in ["ARCHIVED", "DELETED"], do: "archived"
  defp status(nil), do: nil
  defp status(_paused), do: "paused"

  defp minor(nil), do: nil
  defp minor(""), do: nil
  defp minor(value), do: value |> number() |> Decimal.div(100)

  defp number(nil), do: Decimal.new(0)
  defp number(value) when is_integer(value), do: Decimal.new(value)
  defp number(value) when is_float(value), do: Decimal.from_float(value)

  defp number(value) when is_binary(value) do
    case Decimal.parse(value) do
      {decimal, _rest} -> decimal
      :error -> Decimal.new(0)
    end
  end

  defp date(nil), do: nil

  defp date(value) do
    case Date.from_iso8601(String.slice(value, 0, 10)) do
      {:ok, date} -> date
      _ -> nil
    end
  end
end
