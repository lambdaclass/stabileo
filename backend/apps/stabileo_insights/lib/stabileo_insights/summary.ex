defmodule StabileoInsights.Summary do
  @moduledoc """
  The admin site's metrics over the last `days` days: accounts and consents,
  anonymous usage (installs, events, what is used) and cloud projects.
  """

  import Ecto.Query

  alias StabileoInsights.FeedbackInbox
  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.{Account, Consent, Project, UsageEvent}

  @breakdowns [
    {:tools, "tool.select", "tool"},
    {:diagrams, "diagram.show", "kind"},
    {:advanced, "advanced.open", "analysis"},
    {:examples, "example.open", "example"},
    {:exports, "export", "format"},
    {:solve_outcomes, "solve", "outcome"},
    {:step_methods, "steps.open", "method"}
  ]

  def build(days) when is_integer(days) and days in 1..365 do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    since = DateTime.add(now, -days * 86_400)

    %{
      days: days,
      since: since,
      accounts: accounts(since, now),
      usage: usage(since),
      projects: projects(since),
      feedback: %{new: FeedbackInbox.count_new()}
    }
  end

  defp accounts(since, now) do
    week_ago = DateTime.add(now, -7 * 86_400)

    %{
      total: Repo.aggregate(Account, :count),
      active_7d:
        Repo.aggregate(from(a in Account, where: a.last_sign_in_at >= ^week_ago), :count),
      sign_ups: daily(from(a in Account, where: a.inserted_at >= ^since), :inserted_at),
      consents: consent_totals()
    }
  end

  defp consent_totals do
    latest =
      from(c in Consent,
        where: c.kind in ["usage_analytics", "model_research"],
        distinct: [c.account_id, c.kind],
        order_by: [asc: c.account_id, asc: c.kind, desc: c.inserted_at, desc: c.id]
      )

    counts =
      from(l in subquery(latest),
        where: l.granted,
        group_by: l.kind,
        select: {l.kind, count(l.id)}
      )
      |> Repo.all()
      |> Map.new()

    %{
      usage_analytics: Map.get(counts, "usage_analytics", 0),
      model_research: Map.get(counts, "model_research", 0)
    }
  end

  defp usage(since) do
    events = from(e in UsageEvent, where: e.occurred_at >= ^since)

    %{
      events: Repo.aggregate(events, :count),
      installs: Repo.one(from(e in events, select: count(e.install_id, :distinct))),
      daily:
        from(e in events,
          group_by: fragment("date_trunc('day', ?)", e.occurred_at),
          order_by: fragment("date_trunc('day', ?)", e.occurred_at),
          select: %{
            day: fragment("date_trunc('day', ?)::date", e.occurred_at),
            events: count(e.id),
            installs: count(e.install_id, :distinct)
          }
        )
        |> Repo.all(),
      top_events: top(from(e in events, group_by: e.name, select: {e.name, count(e.id)})),
      modes:
        top(
          from(e in events,
            where: not is_nil(e.app_mode),
            group_by: e.app_mode,
            select: {e.app_mode, count(e.install_id, :distinct)}
          )
        ),
      versions:
        top(
          from(e in events,
            where: not is_nil(e.app_version),
            group_by: e.app_version,
            select: {e.app_version, count(e.install_id, :distinct)}
          )
        ),
      locales:
        top(
          from(e in events,
            where: not is_nil(e.locale),
            group_by: e.locale,
            select: {e.locale, count(e.install_id, :distinct)}
          )
        ),
      breakdowns:
        Map.new(@breakdowns, fn {key, name, prop} -> {key, prop_top(events, name, prop)} end)
    }
  end

  defp prop_top(events, name, prop) do
    values =
      from(e in events,
        where: e.name == ^name,
        select: %{value: fragment("?->>?", e.props, ^prop)}
      )

    from(v in subquery(values),
      where: not is_nil(v.value),
      group_by: v.value,
      select: {v.value, count(v.value)}
    )
    |> top()
  end

  defp top(query, limit \\ 12) do
    query
    |> Repo.all()
    |> Enum.sort_by(fn {_label, n} -> -n end)
    |> Enum.take(limit)
    |> Enum.map(fn {label, n} -> %{label: label, count: n} end)
  end

  defp projects(since) do
    active = from(p in Project, where: p.is_active)

    %{
      total: Repo.aggregate(active, :count),
      accounts: Repo.one(from(p in active, select: count(p.account_id, :distinct))),
      by_mode: top(from(p in active, group_by: p.app_mode, select: {p.app_mode, count(p.id)})),
      created: daily(from(p in Project, where: p.inserted_at >= ^since), :inserted_at)
    }
  end

  defp daily(query, field) do
    from(r in query,
      group_by: fragment("date_trunc('day', ?)", field(r, ^field)),
      order_by: fragment("date_trunc('day', ?)", field(r, ^field)),
      select: %{day: fragment("date_trunc('day', ?)::date", field(r, ^field)), count: count(r.id)}
    )
    |> Repo.all()
  end
end
