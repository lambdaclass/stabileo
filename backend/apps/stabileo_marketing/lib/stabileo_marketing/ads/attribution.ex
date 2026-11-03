defmodule StabileoMarketing.Ads.Attribution do
  @moduledoc """
  The accounts our database says each campaign, ad set and ad brought: the
  sign-up sources whose UTM tags name them, with how many of those accounts
  saved a project. It works when the ads carry the parameters Settings shows:
  Meta `utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}`,
  Google `utm_campaign={campaignid}&utm_term={adgroupid}&utm_content={creative}`.
  A campaign also matches by its name, which older links carry.
  """

  import Ecto.Query

  alias StabileoMarketing.Ads
  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.{AccountMilestone, SignupSource}

  @doc "The paid sign-ups of `range` (days in Buenos Aires) from Meta or Google, with whether each saved a project."
  def sources(%Date.Range{} = range) do
    {from, to} = Ads.utc_bounds(range)

    Repo.all(
      from(s in SignupSource,
        left_join: m in AccountMilestone,
        on: m.account_id == s.account_id and m.kind == "first_save",
        where: s.channel in ["meta", "google"] and s.inserted_at >= ^from and s.inserted_at < ^to,
        select: %{
          channel: s.channel,
          campaign: s.utm_campaign,
          ad_group: s.utm_term,
          ad: s.utm_content,
          activated: not is_nil(m.id),
          day: s.inserted_at
        }
      )
    )
  end

  @doc "A function answering an entity's `%{accounts, activated}` among `sources`, for `Report.by_entity/4`."
  def counter(sources, channel_of) do
    fn entity ->
      channel = channel_of[entity.ad_account_id]

      matching =
        Enum.filter(sources, fn source ->
          source.channel == channel and matches?(source, entity)
        end)

      %{accounts: length(matching), activated: Enum.count(matching, & &1.activated)}
    end
  end

  defp matches?(source, %{level: "campaign"} = entity),
    do: source.campaign != nil and source.campaign in [entity.external_id, entity.name]

  defp matches?(source, %{level: "ad_group"} = entity), do: source.ad_group == entity.external_id
  defp matches?(source, %{level: "ad"} = entity), do: source.ad == entity.external_id
  defp matches?(_source, _entity), do: false

  @doc "Accounts and activated accounts per day of `range`, and in total."
  def totals(sources, channels) do
    picked = Enum.filter(sources, &(&1.channel in channels))
    %{accounts: length(picked), activated: Enum.count(picked, & &1.activated)}
  end

  def by_day(sources, channels) do
    sources
    |> Enum.filter(&(&1.channel in channels))
    |> Enum.group_by(&Ads.local_date(&1.day))
    |> Map.new(fn {date, rows} -> {date, %{accounts: length(rows), activated: Enum.count(rows, & &1.activated)}} end)
  end
end
