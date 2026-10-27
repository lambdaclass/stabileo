defmodule StabileoInsights.SummaryTest do
  use StabileoRepo.DataCase, async: false

  alias StabileoAuth.Consents
  alias StabileoInsights.{FeedbackInbox, Summary, Usage}
  alias StabileoRepo.{Factory, Features}

  test "counts accounts, consents, usage and projects over the window" do
    {:ok, _} = Features.set_usage_telemetry_enabled(true)
    {:ok, _} = Features.set_cloud_projects_enabled(true)

    a = Factory.insert(:account)
    b = Factory.insert(:account)
    {:ok, _} = Consents.record(a, "usage_analytics", true)
    {:ok, _} = Consents.record(b, "usage_analytics", true)
    {:ok, _} = Consents.record(b, "usage_analytics", false)
    {:ok, _} = Consents.record(b, "model_research", true)

    for {install, session, tool} <- [
          {"11111111-aaaa", "s-11111111", "member"},
          {"11111111-aaaa", "s-11111111", "member"},
          {"22222222-bbbb", "s-22222222", "load"}
        ] do
      {:ok, _} =
        Usage.ingest(%{
          "install_id" => install,
          "session_id" => session,
          "app_mode" => "basic",
          "app_version" => "0.3.0",
          "events" => [%{"name" => "tool.select", "props" => %{"tool" => tool}}]
        })
    end

    {:ok, _} =
      Usage.ingest(%{
        "install_id" => "v-33333333",
        "session_id" => "v-33333333",
        "app_mode" => "pro",
        "events" => [%{"name" => "solve", "props" => %{"outcome" => "ok"}}]
      })

    gzip = ~s({"a":1}) |> :zlib.gzip() |> Base.encode64()

    {:ok, _} =
      StabileoProjects.Projects.create(a, %{"name" => "P", "app_mode" => "pro", "content" => gzip})

    {:ok, _} = FeedbackInbox.create(%{"kind" => "idea", "message" => "More codes"}, nil, %{})

    s = Summary.build(30)

    assert s.accounts.total == 2
    assert s.accounts.consents == %{usage_analytics: 1, model_research: 1}
    assert [%{count: 2}] = s.accounts.sign_ups
    assert s.usage.events == 4
    assert s.usage.installs == 2
    assert s.usage.visits == 3
    assert s.usage.breakdowns.tools == [%{label: "member", count: 2}, %{label: "load", count: 1}]
    assert s.usage.breakdowns.solve_outcomes == [%{label: "ok", count: 1}]
    assert %{label: "basic", count: 2} in s.usage.modes

    assert [%{events: 4, visits: 3}] =
             Enum.map(s.usage.daily, &Map.take(&1, [:events, :visits]))

    assert s.projects.total == 1
    assert s.projects.by_mode == [%{label: "pro", count: 1}]
    assert s.feedback.new == 1
  end
end
