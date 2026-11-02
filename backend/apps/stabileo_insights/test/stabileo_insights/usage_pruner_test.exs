defmodule StabileoInsights.UsagePrunerTest do
  use StabileoRepo.DataCase, async: false

  alias Ecto.Adapters.SQL.Sandbox
  alias StabileoInsights.UsagePruner
  alias StabileoRepo.Schemas.UsageEvent

  defp event(name, days_ago) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    %{
      id: Ecto.UUID.generate(),
      install_id: "5f0c2c3e-8a7b",
      name: name,
      props: %{},
      occurred_at: DateTime.add(now, -days_ago * 86_400),
      inserted_at: now
    }
  end

  test "each scheduled pass deletes the events past 395 days and keeps the rest" do
    Repo.insert_all(UsageEvent, [event("old", 400), event("kept", 394)])

    pid = start_supervised!({UsagePruner, first_ms: 3_600_000, every_ms: 3_600_000})
    Sandbox.allow(Repo, self(), pid)
    send(pid, :prune)
    :sys.get_state(pid)

    assert [%{name: "kept"}] = Repo.all(UsageEvent)
    assert Process.alive?(pid)
  end
end
