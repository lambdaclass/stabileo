defmodule StabileoInsights.UsageTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoInsights.Usage
  alias StabileoRepo.Features
  alias StabileoRepo.Schemas.UsageEvent

  @install "5f0c2c3e-8a7b-4b8e-9f6e-1a2b3c4d5e6f"

  defp batch(events),
    do: %{
      "install_id" => @install,
      "session_id" => "s-12345678",
      "app_version" => "0.3.0",
      "app_mode" => "basic",
      "locale" => "es",
      "events" => events
    }

  defp now_iso, do: DateTime.utc_now() |> DateTime.to_iso8601()

  test "stores nothing while the server-side switch is off" do
    assert {:ok, %{accepted: 0, rejected: 0, enabled: false}} =
             Usage.ingest(batch([%{"name" => "solve", "at" => now_iso()}]))

    assert Repo.aggregate(UsageEvent, :count) == 0
  end

  describe "switched on" do
    setup do
      {:ok, _} = Features.set_usage_telemetry_enabled(true)
      :ok
    end

    test "stores valid events with the batch's shared fields" do
      assert {:ok, %{accepted: 2, rejected: 0}} =
               Usage.ingest(
                 batch([
                   %{
                     "name" => "solve",
                     "at" => now_iso(),
                     "props" => %{"outcome" => "ok", "ms" => 42, "dim3" => false}
                   },
                   %{"name" => "tool.select", "props" => %{"tool" => "member"}}
                 ])
               )

      [solve, tool] = Repo.all(from(e in UsageEvent, order_by: e.name))
      assert solve.install_id == @install
      assert solve.app_mode == "basic"
      assert solve.props == %{"outcome" => "ok", "ms" => 42, "dim3" => false}
      assert tool.props == %{"tool" => "member"}
      assert tool.occurred_at
    end

    test "drops and counts malformed events, keeping the rest" do
      long = String.duplicate("x", 121)
      old = DateTime.utc_now() |> DateTime.add(-8 * 86_400) |> DateTime.to_iso8601()

      events = [
        %{"name" => "solve"},
        %{"name" => "Bad Name"},
        %{"name" => "solve", "props" => %{"geometry" => %{"nodes" => [1, 2]}}},
        %{"name" => "solve", "props" => %{"note" => long}},
        %{"name" => "solve", "props" => %{"Upper" => 1}},
        %{"name" => "solve", "at" => old},
        %{"name" => "solve", "at" => "yesterday"},
        %{"props" => %{}},
        "not an event"
      ]

      assert {:ok, %{accepted: 1, rejected: 8}} = Usage.ingest(batch(events))
      assert Repo.aggregate(UsageEvent, :count) == 1
    end

    test "rejects a batch from an id that is not random-looking" do
      assert {:ok, %{accepted: 0, rejected: 1}} =
               Usage.ingest(%{batch([%{"name" => "solve"}]) | "install_id" => "me@example.com"})
    end

    test "422 for an empty or oversized batch, and without an install id" do
      assert {:error, {:validation, %{events: [_]}}} = Usage.ingest(batch([]))

      assert {:error, {:validation, %{events: [_]}}} =
               Usage.ingest(batch(List.duplicate(%{"name" => "solve"}, 101)))

      assert {:error, {:validation, %{install_id: ["can't be blank"]}}} =
               Usage.ingest(%{"events" => [%{"name" => "solve"}]})
    end
  end

  test "prune deletes only events older than the window" do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    Repo.insert_all(UsageEvent, [
      %{
        id: Ecto.UUID.generate(),
        install_id: @install,
        name: "old",
        props: %{},
        occurred_at: DateTime.add(now, -400 * 86_400),
        inserted_at: now
      },
      %{
        id: Ecto.UUID.generate(),
        install_id: @install,
        name: "new",
        props: %{},
        occurred_at: now,
        inserted_at: now
      }
    ])

    assert Usage.prune(395) == 1
    assert [%{name: "new"}] = Repo.all(UsageEvent)
  end
end
