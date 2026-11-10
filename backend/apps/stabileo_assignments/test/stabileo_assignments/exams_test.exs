defmodule StabileoAssignments.ExamsTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoAssignments.{Assignments, Exams}
  alias StabileoRepo.{Factory, Features}
  alias StabileoRepo.Schemas.{Account, AssignmentAttempt}

  @opens ~U[2026-11-12 13:00:00Z]
  @closes ~U[2026-11-12 16:00:00Z]

  setup do
    {:ok, _} = Features.set_assignments_enabled(true)
    owner = Factory.insert(:account, name: "Prof. Pérez")
    %{owner: owner, student: Factory.insert(:account, name: "Ada")}
  end

  defp assignment(owner, overrides \\ %{}) do
    {:ok, {assignment, _}} =
      Assignments.create(
        owner,
        Map.merge(
          %{
            "title" => "TP 3",
            "exercise" => %{"id" => "beam-1"},
            "duration_minutes" => 90,
            "opens_at" => "2026-11-12T13:00:00Z",
            "closes_at" => "2026-11-12T16:00:00Z",
            "reveal" => "on_submit"
          },
          overrides
        ),
        @opens
      )

    assignment
  end

  defp at(minutes), do: DateTime.add(@opens, minutes, :minute)

  describe "exam" do
    test "public facts and my attempt, found case-insensitively", %{
      owner: owner,
      student: student
    } do
      a = assignment(owner)
      assert {:ok, {found, found_owner, nil}} = Exams.exam(student, String.downcase(a.code))
      assert found.id == a.id
      assert found_owner.name == "Prof. Pérez"

      {:ok, {attempt, _}} = Exams.start(student, a.code, at(5))
      assert {:ok, {_, _, %AssignmentAttempt{id: id}}} = Exams.exam(student, a.code)
      assert id == attempt.id
    end

    test "unknown code, and a disabled owner's code, are not found", %{
      owner: owner,
      student: student
    } do
      a = assignment(owner)
      assert {:error, :not_found} = Exams.exam(student, "ZZZZZZZZZZ")
      Repo.update_all(from(x in Account, where: x.id == ^owner.id), set: [is_active: false])
      assert {:error, :not_found} = Exams.exam(student, a.code)
      assert {:error, :not_found} = Exams.start(student, a.code, at(5))
    end

    test "status follows the window", %{owner: owner} do
      a = assignment(owner)
      assert Exams.status(a, at(-1)) == "upcoming"
      assert Exams.status(a, at(0)) == "open"
      assert Exams.status(a, @closes) == "closed"
      assert Exams.status(%{a | closes_at: nil}, at(100_000)) == "open"
    end
  end

  describe "start" do
    test "creates the attempt with a server seed and the deadline from the duration", %{
      owner: owner,
      student: student
    } do
      a = assignment(owner)
      assert {:ok, {attempt, assignment}} = Exams.start(student, a.code, at(5))
      assert assignment.exercise == %{"id" => "beam-1"}

      saved = Repo.get!(AssignmentAttempt, attempt.id)
      assert saved.account_id == student.id
      assert saved.assignment_id == a.id
      assert saved.started_at == at(5)
      assert saved.deadline_at == at(95)
      assert saved.seed in 0..4_294_967_295
      assert saved.answers == %{}
    end

    test "the deadline is closes_at when the duration would pass it", %{
      owner: owner,
      student: student
    } do
      a = assignment(owner)
      assert {:ok, {attempt, _}} = Exams.start(student, a.code, at(150))
      assert attempt.deadline_at == @closes
    end

    test "a second start returns the same attempt, even after closing", %{
      owner: owner,
      student: student
    } do
      a = assignment(owner)
      {:ok, {first, _}} = Exams.start(student, a.code, at(5))
      assert {:ok, {again, _}} = Exams.start(student, a.code, at(10))
      assert {again.id, again.seed, again.started_at} == {first.id, first.seed, first.started_at}
      assert {:ok, {late, _}} = Exams.start(student, a.code, at(500))
      assert late.id == first.id
      assert Repo.aggregate(AssignmentAttempt, :count) == 1
    end

    test "refuses before opens_at and after closes_at", %{owner: owner, student: student} do
      a = assignment(owner)
      assert {:error, :assignment_not_open} = Exams.start(student, a.code, at(-1))
      assert {:error, :assignment_closed} = Exams.start(student, a.code, @closes)
      assert Repo.aggregate(AssignmentAttempt, :count) == 0
    end

    test "editing the duration later does not move a started deadline", %{
      owner: owner,
      student: student
    } do
      a = assignment(owner)
      {:ok, {attempt, _}} = Exams.start(student, a.code, at(5))

      {:ok, _} =
        Assignments.update(owner, a.id, %{
          "duration_minutes" => 10,
          "closes_at" => "2026-11-12T13:30:00Z"
        })

      assert Repo.get!(AssignmentAttempt, attempt.id).deadline_at == at(95)
    end
  end

  describe "save_answers" do
    setup %{owner: owner, student: student} do
      a = assignment(owner)
      {:ok, {attempt, _}} = Exams.start(student, a.code, at(0))
      %{attempt: attempt}
    end

    test "stores the answers until the deadline plus the grace", %{
      student: student,
      attempt: attempt
    } do
      assert {:ok, {saved, _}} =
               Exams.save_answers(
                 student,
                 attempt.id,
                 %{"answers" => %{"r1" => "12"}},
                 DateTime.add(at(90), 30)
               )

      assert saved.answers == %{"r1" => "12"}
      assert Repo.get!(AssignmentAttempt, attempt.id).answers == %{"r1" => "12"}

      assert {:error, :attempt_closed} =
               Exams.save_answers(
                 student,
                 attempt.id,
                 %{"answers" => %{"r1" => "99"}},
                 DateTime.add(at(90), 31)
               )

      assert Repo.get!(AssignmentAttempt, attempt.id).answers == %{"r1" => "12"}
    end

    test "422 without answers or with a non-object", %{student: student, attempt: attempt} do
      assert {:error, {:validation, %{answers: ["can't be blank"]}}} =
               Exams.save_answers(student, attempt.id, %{}, at(1))

      assert {:error, changeset} =
               Exams.save_answers(student, attempt.id, %{"answers" => [1]}, at(1))

      assert %{answers: ["is invalid"]} = errors_on(changeset)
    end

    test "another account's attempt is not found", %{attempt: attempt} do
      assert {:error, :not_found} =
               Exams.save_answers(
                 Factory.insert(:account),
                 attempt.id,
                 %{"answers" => %{}},
                 at(1)
               )
    end
  end

  describe "submit" do
    setup %{owner: owner, student: student} do
      a = assignment(owner)
      {:ok, {attempt, _}} = Exams.start(student, a.code, at(0))

      {:ok, _} =
        Exams.save_answers(student, attempt.id, %{"answers" => %{"r1" => "autosaved"}}, at(1))

      %{attempt: attempt}
    end

    test "without answers submits the last autosave", %{student: student, attempt: attempt} do
      assert {:ok, {saved, _}} =
               Exams.submit(student, attempt.id, %{"client_score" => 0.25}, at(2))

      saved = Repo.get!(AssignmentAttempt, saved.id)
      assert saved.answers == %{"r1" => "autosaved"}
      assert saved.client_score == 0.25
      assert saved.submitted_at == at(2)
    end

    test "once: a second submit or autosave is attempt_submitted", %{
      student: student,
      attempt: attempt
    } do
      {:ok, _} = Exams.submit(student, attempt.id, %{"answers" => %{"r1" => "final"}}, at(2))

      assert {:error, :attempt_submitted} =
               Exams.submit(student, attempt.id, %{"answers" => %{"r1" => "again"}}, at(3))

      assert {:error, :attempt_submitted} =
               Exams.save_answers(student, attempt.id, %{"answers" => %{"r1" => "again"}}, at(3))

      saved = Repo.get!(AssignmentAttempt, attempt.id)
      assert saved.answers == %{"r1" => "final"}
      assert saved.submitted_at == at(2)
    end

    test "after the grace it is attempt_closed and the autosave stays", %{
      student: student,
      attempt: attempt
    } do
      assert {:error, :attempt_closed} =
               Exams.submit(student, attempt.id, %{"answers" => %{"r1" => "late"}}, at(92))

      saved = Repo.get!(AssignmentAttempt, attempt.id)
      assert saved.answers == %{"r1" => "autosaved"}
      assert saved.submitted_at == nil
    end

    test "422 on a score outside 0 to 1", %{student: student, attempt: attempt} do
      assert {:error, changeset} =
               Exams.submit(student, attempt.id, %{"client_score" => 3}, at(2))

      assert %{client_score: [_]} = errors_on(changeset)
      assert Repo.get!(AssignmentAttempt, attempt.id).submitted_at == nil
    end

    test "flag off", %{student: student, attempt: attempt} do
      {:ok, _} = Features.set_assignments_enabled(false)
      assert {:error, :assignments_disabled} = Exams.submit(student, attempt.id, %{}, at(2))
      assert {:error, :assignments_disabled} = Exams.get(student, attempt.id)
    end
  end

  describe "closed? and reveal_allowed?" do
    test "on_submit: once submitted, or once the deadline and grace pass", %{
      owner: owner,
      student: student
    } do
      a = assignment(owner)
      {:ok, {attempt, _}} = Exams.start(student, a.code, at(0))
      refute Exams.reveal_allowed?(a, attempt, at(60))
      refute Exams.closed?(attempt, DateTime.add(at(90), 30))
      assert Exams.reveal_allowed?(a, attempt, DateTime.add(at(90), 31))

      {:ok, {submitted, _}} = Exams.submit(student, attempt.id, %{}, at(10))
      assert Exams.closed?(submitted, at(10))
      assert Exams.reveal_allowed?(a, submitted, at(10))
    end

    test "after_close: only once closes_at and the grace pass, submitted or not", %{
      owner: owner,
      student: student
    } do
      a = assignment(owner, %{"reveal" => "after_close"})
      {:ok, {attempt, _}} = Exams.start(student, a.code, at(0))
      {:ok, {submitted, _}} = Exams.submit(student, attempt.id, %{}, at(10))
      refute Exams.reveal_allowed?(a, submitted, at(11))
      refute Exams.reveal_allowed?(a, submitted, DateTime.add(@closes, 30))
      assert Exams.reveal_allowed?(a, submitted, DateTime.add(@closes, 31))
    end
  end
end
