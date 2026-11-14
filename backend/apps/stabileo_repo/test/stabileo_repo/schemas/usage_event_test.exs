defmodule StabileoRepo.Schemas.UsageEventTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.Schemas.UsageEvent

  defp valid_attrs do
    %{
      install_id: "0b7f6c1e-1d2a-4c55-9b7a-7d1f00c0ffee",
      name: "solve.done",
      occurred_at: ~U[2026-10-27 12:00:00Z]
    }
  end

  test "inserts with the required fields" do
    assert {:ok, event} =
             %UsageEvent{}
             |> UsageEvent.changeset(Map.put(valid_attrs(), :props, %{"outcome" => "ok"}))
             |> Repo.insert()

    saved = Repo.get!(UsageEvent, event.id)
    assert saved.name == "solve.done"
    assert saved.props == %{"outcome" => "ok"}
  end

  for field <- [:install_id, :name, :occurred_at] do
    test "requires #{field}" do
      changeset = UsageEvent.changeset(%UsageEvent{}, Map.delete(valid_attrs(), unquote(field)))
      assert %{unquote(field) => ["can't be blank"]} = errors_on(changeset)
    end
  end

  test "names are lowercase dotted identifiers" do
    for bad <- ["Solve", "solve done", "1solve", String.duplicate("a", 65)] do
      changeset = UsageEvent.changeset(%UsageEvent{}, %{valid_attrs() | name: bad})
      assert %{name: ["has invalid format"]} = errors_on(changeset), "accepted #{inspect(bad)}"
    end
  end

  test "an install id must look like a random id, not free text" do
    changeset =
      UsageEvent.changeset(%UsageEvent{}, %{valid_attrs() | install_id: "me@example.com"})

    assert %{install_id: ["has invalid format"]} = errors_on(changeset)
  end
end
