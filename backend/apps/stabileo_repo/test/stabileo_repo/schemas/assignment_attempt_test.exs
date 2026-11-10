defmodule StabileoRepo.Schemas.AssignmentAttemptTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.{Assignment, AssignmentAttempt}

  @started ~U[2026-11-12 13:05:00Z]
  @deadline ~U[2026-11-12 14:35:00Z]

  setup do
    owner = Factory.insert(:account)

    assignment =
      %Assignment{}
      |> Assignment.create_changeset(%{
        account_id: owner.id,
        code: "K7Q2M9XWPA",
        title: "TP 3",
        exercise: %{"id" => "beam-1"},
        duration_minutes: 90,
        opens_at: ~U[2026-11-12 13:00:00Z],
        reveal: "on_submit"
      })
      |> Repo.insert!()

    %{assignment: assignment, student: Factory.insert(:account)}
  end

  defp valid_attrs(assignment, student) do
    %{
      assignment_id: assignment.id,
      account_id: student.id,
      seed: 4_294_967_295,
      started_at: @started,
      deadline_at: @deadline
    }
  end

  defp start(attrs),
    do: %AssignmentAttempt{} |> AssignmentAttempt.start_changeset(attrs) |> Repo.insert()

  test "inserts with the required fields, answers empty", %{assignment: a, student: s} do
    assert {:ok, attempt} = start(valid_attrs(a, s))
    saved = Repo.get!(AssignmentAttempt, attempt.id)
    assert saved.assignment_id == a.id
    assert saved.account_id == s.id
    assert saved.seed == 4_294_967_295
    assert saved.started_at == @started
    assert saved.deadline_at == @deadline
    assert saved.answers == %{}
    assert saved.submitted_at == nil
    assert saved.client_score == nil
  end

  for field <- [:assignment_id, :account_id, :seed, :started_at, :deadline_at] do
    test "requires #{field}", %{assignment: a, student: s} do
      changeset =
        AssignmentAttempt.start_changeset(
          %AssignmentAttempt{},
          Map.delete(valid_attrs(a, s), unquote(field))
        )

      assert %{unquote(field) => ["can't be blank"]} = errors_on(changeset)
    end
  end

  test "the seed is a 32-bit unsigned integer", %{assignment: a, student: s} do
    for seed <- [-1, 4_294_967_296] do
      changeset =
        AssignmentAttempt.start_changeset(%AssignmentAttempt{}, %{valid_attrs(a, s) | seed: seed})

      assert %{seed: [_]} = errors_on(changeset)
    end
  end

  test "the deadline is not before the start", %{assignment: a, student: s} do
    changeset =
      AssignmentAttempt.start_changeset(%AssignmentAttempt{}, %{
        valid_attrs(a, s)
        | deadline_at: ~U[2026-11-12 13:00:00Z]
      })

    assert %{deadline_at: ["must not be before started_at"]} = errors_on(changeset)
  end

  test "one attempt per student and assignment", %{assignment: a, student: s} do
    assert {:ok, _} = start(valid_attrs(a, s))
    assert {:error, changeset} = start(%{valid_attrs(a, s) | seed: 7})
    assert %{assignment_id: ["has already been taken"]} = errors_on(changeset)
    assert Repo.aggregate(AssignmentAttempt, :count) == 1
  end

  test "answers must be a JSON object of at most 64 KiB", %{assignment: a, student: s} do
    {:ok, attempt} = start(valid_attrs(a, s))

    assert %{answers: ["is invalid"]} =
             errors_on(AssignmentAttempt.answers_changeset(attempt, %{answers: "x"}))

    big = %{"a" => String.duplicate("x", AssignmentAttempt.max_answers_bytes())}

    assert %{answers: ["is too large"]} =
             errors_on(AssignmentAttempt.answers_changeset(attempt, %{answers: big}))

    {:ok, saved} =
      attempt
      |> AssignmentAttempt.answers_changeset(%{answers: %{"r1" => "12.5"}})
      |> Repo.update()

    assert Repo.get!(AssignmentAttempt, saved.id).answers == %{"r1" => "12.5"}
  end

  test "submit stamps the time and takes a score from 0 to 1", %{assignment: a, student: s} do
    {:ok, attempt} = start(valid_attrs(a, s))
    at = ~U[2026-11-12 14:00:00Z]

    for score <- [-0.1, 1.5] do
      changeset = AssignmentAttempt.submit_changeset(attempt, %{client_score: score}, at)
      assert %{client_score: [_]} = errors_on(changeset)
    end

    {:ok, saved} =
      attempt
      |> AssignmentAttempt.submit_changeset(%{answers: %{"r1" => "3"}, client_score: 0.5}, at)
      |> Repo.update()

    saved = Repo.get!(AssignmentAttempt, saved.id)
    assert saved.submitted_at == at
    assert saved.client_score == 0.5
    assert saved.answers == %{"r1" => "3"}
  end

  test "neither changeset touches the seed or the timing", %{assignment: a, student: s} do
    {:ok, attempt} = start(valid_attrs(a, s))

    forged = %{
      seed: 1,
      started_at: ~U[2030-01-01 00:00:00Z],
      deadline_at: ~U[2030-01-01 00:00:00Z],
      answers: %{}
    }

    for changeset <- [
          AssignmentAttempt.answers_changeset(attempt, forged),
          AssignmentAttempt.submit_changeset(attempt, forged, @started)
        ] do
      refute Map.has_key?(changeset.changes, :seed)
      refute Map.has_key?(changeset.changes, :started_at)
      refute Map.has_key?(changeset.changes, :deadline_at)
    end
  end

  test "unknown keys (user_id, exam_id) are dropped by cast", %{assignment: a, student: s} do
    attrs =
      a
      |> valid_attrs(s)
      |> Map.drop([:account_id, :assignment_id])
      |> Map.merge(%{user_id: s.id, exam_id: a.id})

    changeset = AssignmentAttempt.start_changeset(%AssignmentAttempt{}, attrs)
    refute changeset.valid?

    assert %{account_id: ["can't be blank"], assignment_id: ["can't be blank"]} =
             errors_on(changeset)
  end

  test "deleting the assignment or the student deletes the attempt", %{assignment: a, student: s} do
    {:ok, first} = start(valid_attrs(a, s))
    Repo.delete!(s)
    assert Repo.get(AssignmentAttempt, first.id) == nil

    other = Factory.insert(:account)
    {:ok, second} = start(valid_attrs(a, other))
    Repo.delete!(a)
    assert Repo.get(AssignmentAttempt, second.id) == nil
  end
end
