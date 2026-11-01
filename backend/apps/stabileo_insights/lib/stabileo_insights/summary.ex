defmodule StabileoInsights.Summary do
  @moduledoc """
  The admin site's metrics over the last `days` days.

  Usage is counted in visits: one visit is one browser session, named by
  `session_id`, or by `install_id` when the event carries no session. A
  browser sends a per-visit id prefixed `v-` until its user acknowledges
  sharing and a stable one after, so `browsers` counts only stable ids.
  Calculations are the one count of events: `solves` and `solve_outcomes`
  count analyses, not visits.
  """

  import Ecto.Query

  alias StabileoInsights.FeedbackInbox
  alias StabileoRepo.{Features, Repo}
  alias StabileoRepo.Schemas.{Account, Consent, Project, Session, UsageEvent}

  @by_visit [
    {:tools, "tool.select", "tool"},
    {:diagrams, "diagram.show", "kind"},
    {:advanced, "advanced.open", "analysis"},
    {:examples, "example.open", "example"},
    {:exports, "export", "format"},
    {:step_methods, "steps.open", "method"},
    {:gate_actions, "gate.shown", "action"}
  ]

  @by_event [
    {:solve_outcomes, "solve", "outcome"},
    {:solve_dims, "solve", "dim3"}
  ]

  def build(days) when is_integer(days) and days in 1..365 do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    since = DateTime.add(now, -days * 86_400)
    events = from(e in UsageEvent, where: e.occurred_at >= ^since)

    %{
      days: days,
      since: since,
      visitors: visitors(events),
      usage: usage(events),
      gate: %{
        asked: visits(from(e in events, where: e.name == "gate.shown")),
        passed: visits(from(e in events, where: e.name == "gate.passed"))
      },
      accounts: accounts(since, now),
      projects: projects(),
      feedback: %{new: FeedbackInbox.count_new()}
    }
  end

  defp visits(query) do
    Repo.one(
      from(e in query,
        select: count(fragment("COALESCE(?, ?)", e.session_id, e.install_id), :distinct)
      )
    )
  end

  defp visitors(events) do
    solving = from(e in events, where: e.name == "solve")

    %{
      visits: visits(events),
      browsers:
        Repo.one(
          from(e in events,
            where: not like(e.install_id, "v-%"),
            select: count(e.install_id, :distinct)
          )
        ),
      visits_with_solve: visits(solving),
      solves: Repo.aggregate(solving, :count),
      daily: daily_visits(events)
    }
  end

  defp daily_visits(events) do
    from(e in events,
      group_by: fragment("date_trunc('day', ?)", e.occurred_at),
      order_by: fragment("date_trunc('day', ?)", e.occurred_at),
      select: %{
        day: fragment("date_trunc('day', ?)::date", e.occurred_at),
        visits: count(fragment("COALESCE(?, ?)", e.session_id, e.install_id), :distinct),
        solving:
          count(
            fragment(
              "DISTINCT CASE WHEN ? = 'solve' THEN COALESCE(?, ?) END",
              e.name,
              e.session_id,
              e.install_id
            )
          )
      }
    )
    |> Repo.all()
  end

  defp usage(events) do
    by_visit =
      Map.new(@by_visit, fn {key, name, prop} -> {key, prop_visits(events, name, prop)} end)

    by_event =
      Map.new(@by_event, fn {key, name, prop} -> {key, prop_events(events, name, prop)} end)

    by_visit
    |> Map.merge(by_event)
    |> Map.merge(%{
      modes: column_visits(events, :app_mode),
      versions: column_visits(events, :app_version),
      locales: column_visits(events, :locale)
    })
  end

  defp column_visits(events, column) do
    from(e in events,
      where: not is_nil(field(e, ^column)),
      group_by: field(e, ^column),
      select:
        {field(e, ^column),
         count(fragment("COALESCE(?, ?)", e.session_id, e.install_id), :distinct)}
    )
    |> top()
  end

  defp prop_values(events, name, prop) do
    from(e in events,
      where: e.name == ^name,
      select: %{
        value: fragment("?->>?", e.props, ^prop),
        visit: fragment("COALESCE(?, ?)", e.session_id, e.install_id)
      }
    )
  end

  defp prop_visits(events, name, prop) do
    from(v in subquery(prop_values(events, name, prop)),
      where: not is_nil(v.value),
      group_by: v.value,
      select: {v.value, count(v.visit, :distinct)}
    )
    |> top()
  end

  defp prop_events(events, name, prop) do
    from(v in subquery(prop_values(events, name, prop)),
      where: not is_nil(v.value),
      group_by: v.value,
      select: {v.value, count()}
    )
    |> top()
  end

  defp top(query, limit \\ 12) do
    query
    |> Repo.all()
    |> Enum.sort_by(fn {label, n} -> {-n, label} end)
    |> Enum.take(limit)
    |> Enum.map(fn {label, n} -> %{label: label, count: n} end)
  end

  defp accounts(since, now) do
    week_ago = DateTime.add(now, -7 * 86_400)

    %{
      total: Repo.aggregate(Account, :count),
      new: Repo.aggregate(from(a in Account, where: a.inserted_at >= ^since), :count),
      active_7d:
        Repo.one(
          from(s in Session,
            where: s.inserted_at >= ^week_ago,
            select: count(s.account_id, :distinct)
          )
        ),
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

  defp projects do
    active = from(p in Project, where: p.is_active)

    %{
      total: Repo.aggregate(active, :count),
      accounts: Repo.one(from(p in active, select: count(p.account_id, :distinct))),
      by_mode: top(from(p in active, group_by: p.app_mode, select: {p.app_mode, count(p.id)})),
      limit: Features.cloud_projects_limit()
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
