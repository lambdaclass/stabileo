defmodule StabileoAssignments.AssignmentJSON do
  @moduledoc false

  alias StabileoAssignments.Exams

  def assignment({assignment, counts}) do
    %{
      id: assignment.id,
      code: assignment.code,
      title: assignment.title,
      duration_minutes: assignment.duration_minutes,
      opens_at: assignment.opens_at,
      closes_at: assignment.closes_at,
      reveal: assignment.reveal,
      attempt_count: counts.attempts,
      submitted_count: counts.submitted,
      inserted_at: assignment.inserted_at,
      updated_at: assignment.updated_at
    }
  end

  def full({assignment, _counts} = row),
    do: Map.put(assignment(row), :exercise, assignment.exercise)

  def owner_attempt({attempt, student}) do
    %{
      id: attempt.id,
      student: %{id: student.id, name: student.name, email: student.email},
      seed: attempt.seed,
      started_at: attempt.started_at,
      deadline_at: attempt.deadline_at,
      submitted_at: attempt.submitted_at,
      answers: attempt.answers,
      client_score: attempt.client_score
    }
  end

  def exam({assignment, owner, attempt}, now) do
    %{
      code: assignment.code,
      title: assignment.title,
      owner_name: owner.name,
      duration_minutes: assignment.duration_minutes,
      opens_at: assignment.opens_at,
      closes_at: assignment.closes_at,
      reveal: assignment.reveal,
      status: Exams.status(assignment, now),
      attempt: attempt && Map.take(attempt, [:id, :started_at, :deadline_at, :submitted_at]),
      now: now
    }
  end

  def attempt({attempt, assignment}, now) do
    %{
      id: attempt.id,
      code: assignment.code,
      title: assignment.title,
      seed: attempt.seed,
      started_at: attempt.started_at,
      deadline_at: attempt.deadline_at,
      submitted_at: attempt.submitted_at,
      answers: attempt.answers,
      client_score: attempt.client_score,
      closed: Exams.closed?(attempt, now),
      reveal: assignment.reveal,
      closes_at: assignment.closes_at,
      reveal_allowed: Exams.reveal_allowed?(assignment, attempt, now),
      exercise: assignment.exercise,
      now: now
    }
  end
end
