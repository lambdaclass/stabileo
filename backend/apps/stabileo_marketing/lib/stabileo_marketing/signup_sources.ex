defmodule StabileoMarketing.SignupSources do
  @moduledoc """
  Where an account's visit came from, from what the browser kept of it (the
  `stb_visit` cookie) and sends with the sign-up as `source`.

  The channel is `google` or `meta` for their ads, with `paid` nil when only a
  `fbclid` says it came from Meta, since Meta adds one to organic links too.
  `placement` is where inside the channel: Google's ValueTrack `{network}`,
  Meta's `{{site_source_name}}`, the search engine, the network or the site.
  `trigger` is what asked for the account: a gate's action (`gate.save`) or a
  button and where it was (`register.hero`).
  """

  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.{Account, SignupSource}

  @keys [
    {"utm_source", :utm_source},
    {"utm_medium", :utm_medium},
    {"utm_campaign", :utm_campaign},
    {"utm_content", :utm_content},
    {"utm_term", :utm_term},
    {"network", :network},
    {"gclid", :gclid},
    {"gbraid", :gbraid},
    {"wbraid", :wbraid},
    {"fbclid", :fbclid},
    {"referrer", :referrer},
    {"landing", :landing_path},
    {"trigger", :trigger}
  ]

  @paid_mediums ~w(cpc ppc cpm cpv cpa paid paid_social paidsocial paid-social paid_search paidsearch display ads ad sponsored)
  @organic_mediums ~w(organic social referral)
  @email_mediums ~w(email e-mail newsletter mail)

  @meta_sources %{
    "fb" => "facebook",
    "facebook" => "facebook",
    "ig" => "instagram",
    "instagram" => "instagram",
    "msg" => "messenger",
    "messenger" => "messenger",
    "an" => "audience_network",
    "audience_network" => "audience_network",
    "th" => "threads",
    "threads" => "threads",
    "meta" => nil
  }

  @google_sources ~w(google adwords googleads google_ads youtube)

  @networks %{
    "g" => "search",
    "s" => "search_partners",
    "d" => "display",
    "ytv" => "youtube",
    "yt" => "youtube",
    "vp" => "youtube",
    "x" => "pmax"
  }

  @search_engines [
    {"google", "google"},
    {"bing", "bing"},
    {"duckduckgo", "duckduckgo"},
    {"yahoo", "yahoo"},
    {"ecosia", "ecosia"},
    {"yandex", "yandex"},
    {"baidu", "baidu"},
    {"brave", "brave"}
  ]

  @social_hosts [
    {"instagram", "instagram"},
    {"facebook", "facebook"},
    {"fb.com", "facebook"},
    {"fb.me", "facebook"},
    {"youtube", "youtube"},
    {"youtu.be", "youtube"},
    {"t.co", "x"},
    {"twitter", "x"},
    {"x.com", "x"},
    {"linkedin", "linkedin"},
    {"lnkd.in", "linkedin"},
    {"tiktok", "tiktok"},
    {"whatsapp", "whatsapp"},
    {"wa.me", "whatsapp"},
    {"pinterest", "pinterest"},
    {"reddit", "reddit"}
  ]

  @mail_hosts ~w(mail.google.com outlook.live.com outlook.office.com mail.yahoo.com)

  @max_length 255

  @doc """
  Saves where `account` came from. Anything but a map is a visit with nothing
  to say, recorded as direct. Returns the changeset error instead of raising, so
  a caller in a transaction can skip a source it cannot keep.
  """
  def record(%Account{id: account_id}, captured) do
    attrs = normalize(if is_map(captured), do: captured, else: %{})

    %SignupSource{}
    |> SignupSource.changeset(
      attrs
      |> Map.merge(classify(attrs))
      |> Map.merge(%{account_id: account_id, first_seen_at: first_seen(captured)})
    )
    |> then(fn changeset ->
      if changeset.valid?, do: Repo.insert(changeset), else: {:error, changeset}
    end)
  end

  @doc "The captured fields `captured` holds, trimmed and cut to what the table keeps."
  def normalize(captured) do
    Enum.reduce(@keys, %{}, fn {key, field}, acc ->
      case clean(captured[key]) do
        nil -> acc
        value -> Map.put_new(acc, field, value)
      end
    end)
  end

  @doc "The channel, whether it was paid, and the placement inside it."
  def classify(attrs) do
    referrer = downcase(attrs[:referrer])

    cond do
      attrs[:gclid] || attrs[:gbraid] || attrs[:wbraid] ->
        google(true, attrs, downcase(attrs[:utm_source]))

      campaign = from_campaign(attrs, referrer) ->
        campaign

      attrs[:fbclid] ->
        result("meta", nil, social_placement(referrer))

      referrer ->
        from_referrer(referrer)

      true ->
        result("direct", nil, nil)
    end
  end

  defp from_campaign(attrs, referrer) do
    source = downcase(attrs[:utm_source])
    medium = downcase(attrs[:utm_medium])

    cond do
      medium in @email_mediums -> result("email", false, source)
      Map.has_key?(@meta_sources, source) -> result("meta", paid(medium), @meta_sources[source] || social_placement(referrer))
      source in @google_sources -> google_source(paid(medium), attrs, source)
      source -> result("other", paid(medium), attrs[:utm_source])
      true -> nil
    end
  end

  defp google(paid, attrs, source) do
    placement =
      Map.get(@networks, downcase(attrs[:network])) || if(source == "youtube", do: "youtube")

    result("google", paid, placement)
  end

  defp google_source(false, _attrs, "youtube"), do: result("social", false, "youtube")
  defp google_source(false, _attrs, _source), do: result("search", false, "google")
  defp google_source(paid, attrs, source), do: google(paid, attrs, source)

  defp from_referrer(referrer) do
    cond do
      referrer in @mail_hosts ->
        result("email", false, nil)

      engine = match(@search_engines, referrer) ->
        result("search", false, engine)

      social = social_placement(referrer) ->
        if social in ["instagram", "facebook"],
          do: result("meta", false, social),
          else: result("social", false, social)

      true ->
        result("referral", false, referrer)
    end
  end

  defp social_placement(nil), do: nil
  defp social_placement(referrer), do: match(@social_hosts, referrer)

  defp match(hosts, referrer) do
    Enum.find_value(hosts, fn {fragment, name} -> if host_has?(referrer, fragment), do: name end)
  end

  defp host_has?(referrer, fragment) do
    if String.contains?(fragment, "."),
      do: referrer == fragment or String.ends_with?(referrer, "." <> fragment),
      else: referrer |> String.split(".") |> Enum.member?(fragment)
  end

  defp paid(medium) when medium in @paid_mediums, do: true
  defp paid(medium) when medium in @organic_mediums, do: false
  defp paid(_medium), do: nil

  defp result(channel, paid, placement), do: %{channel: channel, paid: paid, placement: placement}

  defp first_seen(%{"first_seen" => value}) when is_binary(value) do
    case DateTime.from_iso8601(value) do
      {:ok, at, _offset} -> DateTime.truncate(at, :second)
      _ -> nil
    end
  end

  defp first_seen(_captured), do: nil

  defp downcase(nil), do: nil
  defp downcase(value), do: String.downcase(value)

  defp clean(value) when is_binary(value) do
    value
    |> String.trim_leading()
    |> Stream.unfold(&String.next_codepoint/1)
    |> Stream.reject(&(&1 == <<0>>))
    |> Enum.take(@max_length)
    |> Enum.join()
    |> String.trim()
    |> case do
      "" -> nil
      cleaned -> cleaned
    end
  end

  defp clean(_value), do: nil
end
