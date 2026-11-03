defmodule StabileoMarketing.Ads.Goals do
  @moduledoc """
  What each campaign is after, so its spend is charged to that result:
  `signups`, `activations` (a first saved project), `clicks`, `awareness`
  (reach, views, engagement: no conversion), or `conversions` for a Google
  campaign bidding on every conversion at once, whose spend is shared among
  the sign-ups and activations it brought.

  The platform says it when it can (Meta's ad set optimization and the event
  or custom conversion it promotes, or the result type). Otherwise the name
  and the objective decide; with nothing to go on the goal is nil and the
  spend is charged to no result.
  """

  @result_types %{
    "actions:offsite_conversion.fb_pixel_complete_registration" => "signups",
    "actions:complete_registration" => "signups",
    "actions:link_click" => "clicks",
    "actions:landing_page_view" => "clicks",
    "actions:post_engagement" => "awareness",
    "actions:video_view" => "awareness",
    "video_thruplay_watched_actions" => "awareness",
    "reach" => "awareness",
    "impressions" => "awareness",
    "google:conversions" => "conversions"
  }

  @meta_optimizations %{
    "LINK_CLICKS" => "clicks",
    "LANDING_PAGE_VIEWS" => "clicks",
    "THRUPLAY" => "awareness",
    "POST_ENGAGEMENT" => "awareness",
    "REACH" => "awareness",
    "IMPRESSIONS" => "awareness"
  }

  @objectives %{
    "OUTCOME_SALES" => "signups",
    "OUTCOME_LEADS" => "signups",
    "OUTCOME_TRAFFIC" => "clicks",
    "OUTCOME_ENGAGEMENT" => "awareness",
    "OUTCOME_AWARENESS" => "awareness",
    "SEARCH" => "conversions",
    "PERFORMANCE_MAX" => "conversions",
    "DEMAND_GEN" => "conversions",
    "DISPLAY" => "conversions",
    "VIDEO" => "awareness"
  }

  @doc "An ad set's goal from its optimization, the pixel event and the custom conversion it promotes."
  def from_meta(optimization_goal, custom_event_type, custom_kind) do
    cond do
      custom_kind == :activation -> "activations"
      custom_kind == :signup_click -> "clicks"
      custom_event_type == "COMPLETE_REGISTRATION" -> "signups"
      true -> Map.get(@meta_optimizations, optimization_goal)
    end
  end

  @doc """
  A campaign's goal: the one the platform reported, else the latest result
  type its days carry, else what its name names, else its objective.
  """
  def resolve(campaign, result_types) do
    reported = get_in(Map.get(campaign, :details) || %{}, ["goal"])

    reported ||
      result_types |> Enum.reverse() |> Enum.find_value(&Map.get(@result_types, &1)) ||
      from_name(campaign.name) || Map.get(@objectives, campaign.objective)
  end

  defp from_name(nil), do: nil

  defp from_name(name) do
    cond do
      name =~ ~r/first.?save|activaci|guardad/iu -> "activations"
      name =~ ~r/registr|sign.?up|cuenta/iu -> "signups"
      name =~ ~r/tr[aá]fico|traffic/iu -> "clicks"
      true -> nil
    end
  end
end
