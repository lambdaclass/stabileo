defmodule StabileoInsights.SummaryTest do
  use StabileoRepo.DataCase, async: false

  alias StabileoAuth.Consents
  alias StabileoInsights.{FeedbackInbox, Summary, Usage}
  alias StabileoRepo.{Factory, Features}

  defp send_events(install, session, mode, events) do
    {:ok, _} =
      Usage.ingest(%{
        "install_id" => install,
        "session_id" => session,
        "app_mode" => mode,
        "app_version" => "0.3.0",
        "locale" => "es",
        "events" => Enum.map(events, fn {name, props} -> %{"name" => name, "props" => props} end)
      })
  end

  setup do
    {:ok, _} = Features.set_usage_telemetry_enabled(true)
    {:ok, _} = Features.set_cloud_projects_enabled(true)
    :ok
  end

  test "usage counts visits, and calculations count calculations" do
    send_events("11111111-aaaa", "s-11111111", "basic", [
      {"diagram.show", %{"kind" => "moment"}},
      {"diagram.show", %{"kind" => "moment"}},
      {"diagram.show", %{"kind" => "moment"}},
      {"solve", %{"outcome" => "ok", "dim3" => false}},
      {"solve", %{"outcome" => "ok", "dim3" => false}}
    ])

    send_events("11111111-aaaa", "s-11111112", "pro", [
      {"diagram.show", %{"kind" => "moment"}},
      {"solve", %{"outcome" => "error", "dim3" => true}}
    ])

    send_events("v-33333333", "v-33333333", "basic", [
      {"tool.select", %{"tool" => "member"}},
      {"gate.shown", %{"action" => "save"}},
      {"gate.passed", %{"action" => "save"}}
    ])

    s = Summary.build(30)

    assert s.visitors.visits == 3
    assert s.visitors.browsers == 1
    assert s.visitors.visits_with_solve == 2
    assert s.visitors.solves == 3

    assert [%{visits: 3, solving: 2}] =
             Enum.map(s.visitors.daily, &Map.take(&1, [:visits, :solving]))

    assert s.usage.diagrams == [%{label: "moment", count: 2}]
    assert s.usage.tools == [%{label: "member", count: 1}]
    assert s.usage.solve_outcomes == [%{label: "ok", count: 2}, %{label: "error", count: 1}]
    assert s.usage.solve_dims == [%{label: "false", count: 2}, %{label: "true", count: 1}]
    assert s.usage.modes == [%{label: "basic", count: 2}, %{label: "pro", count: 1}]
    assert s.usage.locales == [%{label: "es", count: 3}]
    assert s.usage.gate_actions == [%{label: "save", count: 1}]
    assert s.gate == %{asked: 1, passed: 1}
  end

  test "accounts count sign-ups in the window, activity by session and current consents" do
    a = Factory.insert(:account)
    b = Factory.insert(:account)
    {:ok, _} = Consents.record(a, "usage_analytics", true)
    {:ok, _} = Consents.record(b, "usage_analytics", true)
    {:ok, _} = Consents.record(b, "usage_analytics", false)
    {:ok, _} = Consents.record(b, "model_research", true)
    {:ok, _} = StabileoAuth.Sessions.create_session(a, %{}, 3600)

    s = Summary.build(30)

    assert s.accounts.total == 2
    assert s.accounts.new == 2
    assert s.accounts.active_7d == 1
    assert s.accounts.consents == %{usage_analytics: 1, model_research: 1}
    assert [%{count: 2}] = s.accounts.sign_ups
  end

  test "projects and feedback" do
    a = Factory.insert(:account)
    gzip = ~s({"a":1}) |> :zlib.gzip() |> Base.encode64()

    {:ok, _} =
      StabileoProjects.Projects.create(a, %{"name" => "P", "app_mode" => "pro", "content" => gzip})

    {:ok, _} = FeedbackInbox.create(%{"kind" => "idea", "message" => "More codes"}, nil, %{})

    s = Summary.build(30)

    assert s.projects == %{total: 1, accounts: 1, by_mode: [%{label: "pro", count: 1}], limit: 1}
    assert s.feedback.new == 1
  end
end
