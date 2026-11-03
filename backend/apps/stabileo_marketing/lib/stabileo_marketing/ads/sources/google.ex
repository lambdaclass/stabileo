defmodule StabileoMarketing.Ads.Sources.Google do
  @moduledoc """
  Reads a Google Ads customer through the Google Ads API (`googleAds:searchStream`
  with GAQL): campaigns, ad groups and ads, daily metrics per level, conversions
  by conversion action, and the budget each campaign had every day.

  Signs in with the service account key saved in Settings, which has read
  access to the customer; API access comes from the Google Cloud project the
  service account belongs to, with no developer token. The manager account
  (`login-customer-id`) is sent when one is set.

  Sign-ups are the conversions whose action category is SIGNUP, counted with
  `metrics.conversions`, so only primary actions count. Activations are not
  measured here: nil.

  Google keeps 30 days of change history: the days inside that window get the
  budget each campaign really had, the older ones the oldest known budget,
  marked as estimated.
  """

  @behaviour StabileoMarketing.Ads.Source

  alias StabileoMarketing.Ads.Source
  alias StabileoMarketing.{Configs, HttpClient}
  alias StabileoRepo.Schemas.AdAccount

  @version "v26"
  @token_url "https://oauth2.googleapis.com/token"
  @scope "https://www.googleapis.com/auth/adwords"
  @history_days 30

  @impl true
  def fetch(%AdAccount{external_id: customer_id}, range, today) do
    customer_id = digits(customer_id)

    with {:ok, headers} <- headers(),
         search = &search(customer_id, headers, &1),
         {:ok, [customer | _]} <-
           search.("SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1"),
         {:ok, campaigns} <-
           search.(
             "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign.start_date_time, campaign.end_date_time, campaign.campaign_budget, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'"
           ),
         {:ok, ad_groups} <-
           search.(
             "SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id FROM ad_group WHERE ad_group.status != 'REMOVED'"
           ),
         {:ok, ads} <-
           search.(
             "SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.status, ad_group.id, campaign.id FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED'"
           ),
         between = "segments.date BETWEEN '#{range.first}' AND '#{range.last}'",
         {:ok, campaign_days} <-
           search.(
             "SELECT segments.date, campaign.id, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE #{between} AND metrics.impressions > 0"
           ),
         {:ok, group_days} <-
           search.(
             "SELECT segments.date, campaign.id, ad_group.id, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM ad_group WHERE #{between} AND metrics.impressions > 0"
           ),
         {:ok, ad_days} <-
           search.(
             "SELECT segments.date, campaign.id, ad_group.id, ad_group_ad.ad.id, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM ad_group_ad WHERE #{between} AND metrics.impressions > 0"
           ),
         {:ok, conversion_days} <-
           search.(
             "SELECT segments.date, campaign.id, segments.conversion_action_category, segments.conversion_action_name, metrics.conversions FROM campaign WHERE #{between} AND metrics.conversions > 0"
           ),
         window_start = Date.add(today, -(@history_days - 1)),
         {:ok, changes} <-
           search.(
             "SELECT change_event.change_date_time, change_event.change_resource_type, change_event.change_resource_name, change_event.changed_fields, change_event.old_resource, change_event.new_resource FROM change_event WHERE change_event.change_date_time >= '#{window_start}' AND change_event.change_date_time <= '#{today} 23:59:59' AND change_event.change_resource_type IN ('CAMPAIGN_BUDGET', 'CAMPAIGN') ORDER BY change_event.change_date_time LIMIT 10000"
           ) do
      conversions = Enum.map(conversion_days, &conversion/1)
      signups = signups_by_campaign_day(conversions)

      {:ok,
       %{
         account: %{
           name: get_in(customer, ["customer", "descriptiveName"]),
           currency: get_in(customer, ["customer", "currencyCode"])
         },
         entities:
           Enum.map(campaigns, &campaign/1) ++ Enum.map(ad_groups, &ad_group/1) ++ Enum.map(ads, &ad/1),
         metrics:
           Enum.map(campaign_days, &metric(&1, "campaign", signups)) ++
             Enum.map(group_days, &metric(&1, "ad_group", nil)) ++
             Enum.map(ad_days, &metric(&1, "ad", nil)),
         conversions: conversions,
         budgets: budgets(campaigns, history(changes), range, window_start, customer_id)
       }}
    end
  end

  @impl true
  def check(%AdAccount{external_id: customer_id}) do
    case service_account() do
      {:ok, _key} ->
        case headers() do
          {:ok, headers} ->
            [Source.step("credentials", :ok), Source.step("auth", :ok), account_step(digits(customer_id), headers)]

          {:error, reason} ->
            [
              Source.step("credentials", :ok),
              Source.step("auth", :error, Source.describe_error(reason)),
              Source.step("account", :skipped)
            ]
        end

      {:error, :not_connected} ->
        [Source.step("credentials", :error), Source.step("auth", :skipped), Source.step("account", :skipped)]
    end
  end

  defp account_step(customer_id, headers) do
    case search(customer_id, headers, "SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1") do
      {:ok, [customer | _]} ->
        Source.step(
          "account",
          :ok,
          "#{get_in(customer, ["customer", "descriptiveName"])} (#{get_in(customer, ["customer", "currencyCode"])})"
        )

      {:ok, []} ->
        Source.step("account", :error, "Google returned no customer")

      {:error, reason} ->
        Source.step("account", :error, Source.describe_error(reason))
    end
  end

  defp headers do
    with {:ok, key} <- service_account(),
         {:ok, access_token} <- service_account_token(key) do
      login = digits(Configs.google_ads_login_customer_id())

      {:ok,
       [{"Authorization", "Bearer #{access_token}"}] ++
         if(login, do: [{"login-customer-id", login}], else: [])}
    end
  end

  defp service_account do
    case Configs.google_ads_service_account() do
      key when is_binary(key) -> {:ok, key}
      _ -> {:error, :not_connected}
    end
  end

  defp service_account_token(key) do
    with {:ok, %{"client_email" => email, "private_key" => pem} = account} <- decode_key(key),
         [entry | _] <- :public_key.pem_decode(pem) do
      token_url = account["token_uri"] || @token_url
      now = System.system_time(:second)

      unsigned =
        base64(Jason.encode!(%{alg: "RS256", typ: "JWT"})) <>
          "." <>
          base64(Jason.encode!(%{iss: email, scope: @scope, aud: token_url, iat: now, exp: now + 3600}))

      signature = :public_key.sign(unsigned, :sha256, :public_key.pem_entry_decode(entry))

      token_url
      |> HttpClient.post_form([
        {"grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"},
        {"assertion", unsigned <> "." <> base64(signature)}
      ])
      |> access_token()
    else
      [] -> {:error, :invalid_service_account}
      error -> error
    end
  end

  defp decode_key(json) do
    case Jason.decode(json) do
      {:ok, %{"client_email" => _, "private_key" => _} = account} -> {:ok, account}
      _ -> {:error, :invalid_service_account}
    end
  end

  defp base64(binary), do: Base.url_encode64(binary, padding: false)

  defp access_token({:ok, %{"access_token" => access_token}}), do: {:ok, access_token}
  defp access_token({:ok, _other}), do: {:error, :invalid_oauth_response}
  defp access_token(error), do: error

  defp search(customer_id, headers, query) do
    url = "https://googleads.googleapis.com/#{@version}/customers/#{customer_id}/googleAds:searchStream"

    case HttpClient.post_json(url, headers, %{query: query}) do
      {:ok, batches} when is_list(batches) -> {:ok, Enum.flat_map(batches, &(&1["results"] || []))}
      {:ok, %{"results" => results}} -> {:ok, results}
      {:ok, _empty} -> {:ok, []}
      error -> error
    end
  end

  defp campaign(row) do
    campaign = row["campaign"]

    %{
      level: "campaign",
      external_id: campaign["id"],
      campaign_external_id: campaign["id"],
      name: campaign["name"],
      status: status(campaign["status"]),
      objective: campaign["advertisingChannelType"],
      daily_budget: micros(get_in(row, ["campaignBudget", "amountMicros"])),
      starts_on: date(campaign["startDateTime"]),
      ends_on: date(campaign["endDateTime"]),
      details: %{"bid_strategy" => campaign["biddingStrategyType"], "goal" => "conversions"}
    }
  end

  defp ad_group(row) do
    %{
      level: "ad_group",
      external_id: get_in(row, ["adGroup", "id"]),
      campaign_external_id: get_in(row, ["campaign", "id"]),
      ad_group_external_id: get_in(row, ["adGroup", "id"]),
      name: get_in(row, ["adGroup", "name"]),
      status: status(get_in(row, ["adGroup", "status"]))
    }
  end

  defp ad(row) do
    ad = get_in(row, ["adGroupAd", "ad"]) || %{}

    %{
      level: "ad",
      external_id: ad["id"],
      campaign_external_id: get_in(row, ["campaign", "id"]),
      ad_group_external_id: get_in(row, ["adGroup", "id"]),
      name: ad["name"] || ad["type"],
      status: status(get_in(row, ["adGroupAd", "status"])),
      creative: %{
        "type" => ad["type"],
        "format" => google_format(ad["type"]),
        "link" => List.first(ad["finalUrls"] || [])
      }
    }
  end

  defp google_format(type) when type in ["RESPONSIVE_SEARCH_AD", "EXPANDED_TEXT_AD", "TEXT_AD"], do: "search"
  defp google_format(type) when type in ["RESPONSIVE_DISPLAY_AD", "IMAGE_AD"], do: "image"
  defp google_format(type) when is_binary(type), do: if(type =~ "VIDEO", do: "video")
  defp google_format(_type), do: nil

  defp metric(row, level, signups) do
    date = Date.from_iso8601!(get_in(row, ["segments", "date"]))
    campaign_id = get_in(row, ["campaign", "id"])
    zero = Decimal.new(0)

    external_id =
      case level do
        "campaign" -> campaign_id
        "ad_group" -> get_in(row, ["adGroup", "id"])
        "ad" -> get_in(row, ["adGroupAd", "ad", "id"])
      end

    %{
      date: date,
      level: level,
      external_id: external_id,
      campaign_external_id: campaign_id,
      ad_group_external_id: get_in(row, ["adGroup", "id"]),
      spend: micros(get_in(row, ["metrics", "costMicros"])) || zero,
      impressions: number(get_in(row, ["metrics", "impressions"])),
      clicks: number(get_in(row, ["metrics", "clicks"])),
      signups: if(signups, do: Map.get(signups, {date, campaign_id}, zero), else: zero),
      results: number(get_in(row, ["metrics", "conversions"])),
      result_type: "google:conversions"
    }
  end

  defp conversion(row) do
    name = get_in(row, ["segments", "conversionActionName"])

    %{
      date: Date.from_iso8601!(get_in(row, ["segments", "date"])),
      level: "campaign",
      external_id: get_in(row, ["campaign", "id"]),
      campaign_external_id: get_in(row, ["campaign", "id"]),
      conversion_key: name,
      conversion_name: name,
      conversion_group: get_in(row, ["segments", "conversionActionCategory"]),
      count: number(get_in(row, ["metrics", "conversions"]))
    }
  end

  defp signups_by_campaign_day(conversions) do
    for %{conversion_group: "SIGNUP"} = conversion <- conversions, reduce: %{} do
      acc ->
        Map.update(
          acc,
          {conversion.date, conversion.campaign_external_id},
          conversion.count,
          &Decimal.add(&1, conversion.count)
        )
    end
  end

  defp history(changes) do
    changes
    |> Enum.flat_map(&change(&1["changeEvent"] || %{}))
    |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))
    |> Map.new(fn {key, list} -> {key, Enum.sort(list)} end)
  end

  defp change(%{"changeResourceType" => "CAMPAIGN_BUDGET"} = event) do
    path = ["campaignBudget", "amountMicros"]

    with before when before != nil <- get_in(event, ["oldResource" | path]),
         true <- "amountMicros" in changed_fields(event) do
      [
        {{event["changeResourceName"], :budget},
         {changed_at(event), micros(before), micros(get_in(event, ["newResource" | path]))}}
      ]
    else
      _ -> []
    end
  end

  defp change(%{"changeResourceType" => "CAMPAIGN"} = event) do
    path = ["campaign", "status"]

    with before when before != nil <- get_in(event, ["oldResource" | path]),
         true <- "status" in changed_fields(event) do
      [
        {{event["changeResourceName"], :active},
         {changed_at(event), before == "ENABLED", get_in(event, ["newResource" | path]) == "ENABLED"}}
      ]
    else
      _ -> []
    end
  end

  defp change(_event), do: []

  defp changed_fields(event), do: String.split(event["changedFields"] || "", ",")
  defp changed_at(event), do: String.slice(event["changeDateTime"] || "", 0, 19)

  defp value_at(history, key, current, moment) do
    case Enum.find(Map.get(history, key, []), fn {at, _before, _after} -> at > moment end) do
      {_at, before, _after} -> before
      nil -> current
    end
  end

  defp budgets(campaigns, history, range, window_start, customer_id) do
    for row <- campaigns,
        date <- range,
        budget = day_budget(row, history, date, customer_id),
        budget != nil do
      %{
        date: date,
        campaign_external_id: get_in(row, ["campaign", "id"]),
        budget: budget,
        estimated: Date.compare(date, window_start) == :lt
      }
    end
  end

  defp day_budget(%{"campaign" => campaign} = row, history, date, customer_id) do
    resource = campaign["resourceName"] || "customers/#{customer_id}/campaigns/#{campaign["id"]}"
    current = micros(get_in(row, ["campaignBudget", "amountMicros"]))
    enabled = campaign["status"] == "ENABLED"

    active? =
      value_at(history, {resource, :active}, enabled, "#{date} 00:00:00") or
        value_at(history, {resource, :active}, enabled, "#{date} 23:59:59")

    if current && scheduled?(campaign, date) && active? do
      budget = value_at(history, {campaign["campaignBudget"], :budget}, current, "#{date} 23:59:59")
      if Decimal.gt?(budget, 0), do: budget
    end
  end

  defp scheduled?(campaign, date) do
    starts_on = date(campaign["startDateTime"])
    ends_on = date(campaign["endDateTime"])

    (is_nil(starts_on) or Date.compare(starts_on, date) != :gt) and
      (is_nil(ends_on) or Date.compare(ends_on, date) != :lt)
  end

  defp status("ENABLED"), do: "active"
  defp status("PAUSED"), do: "paused"
  defp status("REMOVED"), do: "archived"
  defp status(_), do: nil

  defp digits(nil), do: nil
  defp digits(id), do: String.replace(id, "-", "")

  defp date(nil), do: nil

  defp date(value) do
    case Date.from_iso8601(String.slice(value, 0, 10)) do
      {:ok, date} -> date
      _ -> nil
    end
  end

  defp micros(nil), do: nil
  defp micros(value), do: value |> number() |> Decimal.div(1_000_000)

  defp number(nil), do: Decimal.new(0)
  defp number(value) when is_integer(value), do: Decimal.new(value)
  defp number(value) when is_float(value), do: Decimal.from_float(value)

  defp number(value) when is_binary(value) do
    case Decimal.parse(value) do
      {decimal, _rest} -> decimal
      :error -> Decimal.new(0)
    end
  end
end
