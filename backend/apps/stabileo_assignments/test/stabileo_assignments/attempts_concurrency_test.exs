defmodule StabileoAssignments.AttemptsConcurrencyTest do
  use ExUnit.Case, async: false

  import Ecto.Query

  alias Ecto.Adapters.SQL.Sandbox
  alias StabileoAssignments.{Assignments, Exams}
  alias StabileoRepo.{Factory, Features, Repo, SystemSettings}
  alias StabileoRepo.Schemas.{Account, Assignment, AssignmentAttempt}

  setup do
    Sandbox.mode(Repo, :auto)
    {:ok, _} = Features.set_assignments_enabled(true)
    owner = Factory.insert(:account)
    student = Factory.insert(:account)

    on_exit(fn ->
      Sandbox.mode(Repo, :auto)
      Repo.delete_all(from(a in Account, where: a.id in ^[owner.id, student.id]))
      SystemSettings.delete("assignments_enabled")
      Sandbox.mode(Repo, :manual)
    end)

    %{owner: owner, student: student}
  end

  defp race(n, fun) do
    parent = self()

    tasks =
      for i <- 1..n do
        Task.async(fn ->
          send(parent, {:ready, self()})
          receive(do: (:go -> fun.(i)))
        end)
      end

    pids = for _ <- tasks, do: receive(do: ({:ready, pid} -> pid))
    Enum.each(pids, &send(&1, :go))
    Task.await_many(tasks, 15_000)
  end

  test "starts racing for one student return one attempt and one seed", %{
    owner: owner,
    student: student
  } do
    {:ok, {assignment, _}} =
      Assignments.create(owner, %{
        "title" => "Parcial",
        "exercise" => %{"id" => "beam-1"},
        "duration_minutes" => 60,
        "reveal" => "on_submit"
      })

    results = race(8, fn _ -> Exams.start(student, assignment.code) end)

    attempts = for {:ok, {attempt, _}} <- results, do: {attempt.id, attempt.seed}
    assert length(attempts) == 8
    assert [_one] = Enum.uniq(attempts)

    assert Repo.aggregate(
             from(t in AssignmentAttempt, where: t.assignment_id == ^assignment.id),
             :count
           ) == 1
  end

  test "creates racing at the limit stop at 100", %{owner: owner} do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    Repo.insert_all(
      Assignment,
      for i <- 1..99 do
        %{
          id: Ecto.UUID.generate(),
          account_id: owner.id,
          title: "T#{i}",
          exercise: %{},
          duration_minutes: 10,
          opens_at: now,
          reveal: "on_submit",
          code: "RACE" <> String.pad_leading(Integer.to_string(i), 6, "0"),
          inserted_at: now,
          updated_at: now
        }
      end
    )

    results =
      race(6, fn i ->
        Assignments.create(owner, %{
          "title" => "R#{i}",
          "exercise" => %{},
          "duration_minutes" => 10,
          "reveal" => "on_submit"
        })
      end)

    assert Enum.count(results, &match?({:ok, _}, &1)) == 1
    assert Enum.count(results, &(&1 == {:error, :assignment_limit_reached})) == 5
    assert Repo.aggregate(from(a in Assignment, where: a.account_id == ^owner.id), :count) == 100
  end
end
