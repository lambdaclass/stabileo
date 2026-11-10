defmodule StabileoAssignments.Exams do
  @moduledoc "Nothing here grades: answers and `client_score` are stored as the browser sends them."

  import Ecto.Query

  alias StabileoAssignments.Assignments
  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.{Account, Assignment, AssignmentAttempt}

  @grace_seconds 30

  def grace_seconds, do: @grace_seconds

  def exam(%Account{id: account_id}, code) do
    with :ok <- Assignments.enabled(),
         {:ok, {assignment, owner}} <- by_code(code) do
      attempt =
        Repo.get_by(AssignmentAttempt, assignment_id: assignment.id, account_id: account_id)

      {:ok, {assignment, owner, attempt}}
    end
  end

  @doc """
  Returns the account's attempt, creating it if the window is open. Two starts at once return the
  same row: the insert does nothing on the unique index and the row is read back.
  """
  def start(%Account{id: account_id}, code, now \\ now()) do
    with :ok <- Assignments.enabled() do
      Repo.transaction(fn -> start_locked(account_id, code, now) end)
    end
  end

  defp start_locked(account_id, code, now) do
    with {:ok, {assignment, _owner}} <- by_code(code, lock: true),
         {:ok, attempt} <- existing_or_new(assignment, account_id, now) do
      {attempt, assignment}
    else
      {:error, reason} -> Repo.rollback(reason)
    end
  end

  def get(%Account{} = account, id) do
    with :ok <- Assignments.enabled(),
         {:ok, attempt} <- fetch(account, id) do
      {:ok, {attempt, attempt.assignment}}
    end
  end

  @doc "Accepted until `deadline_at` plus the grace, and never after the submit."
  def save_answers(%Account{} = account, id, params, now \\ now()) do
    with :ok <- Assignments.enabled(),
         {:ok, answers} <- required_answers(params) do
      locked_write(
        account,
        id,
        now,
        &AssignmentAttempt.answers_changeset(&1, %{answers: answers})
      )
    end
  end

  @doc "`answers` is optional: without it the last autosave is what gets submitted."
  def submit(%Account{} = account, id, params, now \\ now()) do
    with :ok <- Assignments.enabled() do
      attrs = Map.take(params, ["answers", "client_score"])
      locked_write(account, id, now, &AssignmentAttempt.submit_changeset(&1, attrs, now))
    end
  end

  def status(%Assignment{} = assignment, now) do
    cond do
      DateTime.compare(now, assignment.opens_at) == :lt -> "upcoming"
      closed_window?(assignment, now) -> "closed"
      true -> "open"
    end
  end

  def closed?(%AssignmentAttempt{} = attempt, now) do
    not is_nil(attempt.submitted_at) or
      DateTime.compare(now, DateTime.add(attempt.deadline_at, @grace_seconds)) == :gt
  end

  def reveal_allowed?(%Assignment{reveal: "on_submit"}, attempt, now), do: closed?(attempt, now)

  def reveal_allowed?(%Assignment{reveal: "after_close", closes_at: closes_at}, _attempt, now),
    do:
      not is_nil(closes_at) and
        DateTime.compare(now, DateTime.add(closes_at, @grace_seconds)) == :gt

  defp existing_or_new(assignment, account_id, now) do
    case Repo.get_by(AssignmentAttempt, assignment_id: assignment.id, account_id: account_id) do
      %AssignmentAttempt{} = attempt -> {:ok, attempt}
      nil -> insert(assignment, account_id, now)
    end
  end

  defp insert(assignment, account_id, now) do
    with :ok <- window_open(assignment, now),
         {:ok, _} <-
           %AssignmentAttempt{}
           |> AssignmentAttempt.start_changeset(%{
             assignment_id: assignment.id,
             account_id: account_id,
             seed: seed(),
             started_at: now,
             deadline_at: deadline(assignment, now)
           })
           |> Repo.insert(on_conflict: :nothing, conflict_target: [:assignment_id, :account_id]) do
      {:ok, Repo.get_by!(AssignmentAttempt, assignment_id: assignment.id, account_id: account_id)}
    end
  end

  defp window_open(assignment, now) do
    case status(assignment, now) do
      "open" -> :ok
      "upcoming" -> {:error, :assignment_not_open}
      "closed" -> {:error, :assignment_closed}
    end
  end

  defp closed_window?(%Assignment{closes_at: nil}, _now), do: false

  defp closed_window?(%Assignment{closes_at: closes_at}, now),
    do: DateTime.compare(now, closes_at) != :lt

  defp deadline(%Assignment{duration_minutes: minutes, closes_at: closes_at}, now) do
    by_duration = DateTime.add(now, minutes, :minute)

    if closes_at && DateTime.compare(closes_at, by_duration) == :lt,
      do: closes_at,
      else: by_duration
  end

  defp seed do
    <<seed::unsigned-32>> = :crypto.strong_rand_bytes(4)
    seed
  end

  defp locked_write(account, id, now, changeset) do
    Repo.transaction(fn ->
      with {:ok, attempt} <- fetch(account, id, lock: true),
           :ok <- writable(attempt, now),
           {:ok, saved} <- attempt |> changeset.() |> Repo.update() do
        {saved, attempt.assignment}
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp writable(%AssignmentAttempt{submitted_at: %DateTime{}}, _now),
    do: {:error, :attempt_submitted}

  defp writable(attempt, now),
    do: if(closed?(attempt, now), do: {:error, :attempt_closed}, else: :ok)

  defp required_answers(%{"answers" => answers}), do: {:ok, answers}
  defp required_answers(_params), do: {:error, {:validation, %{answers: ["can't be blank"]}}}

  defp by_code(code, opts \\ [])

  defp by_code(code, opts) when is_binary(code) do
    query =
      from(a in Assignment,
        join: o in assoc(a, :account),
        where: a.code == ^String.upcase(code) and o.is_active,
        select: {a, o}
      )

    query = if opts[:lock], do: lock(query, "FOR SHARE OF a0"), else: query

    case Repo.one(query) do
      {assignment, owner} -> {:ok, {assignment, owner}}
      nil -> {:error, :not_found}
    end
  end

  defp by_code(_code, _opts), do: {:error, :not_found}

  defp fetch(%Account{id: account_id}, id, opts \\ []) do
    with {:ok, uuid} <- Ecto.UUID.cast(id),
         query =
           from(t in AssignmentAttempt,
             join: a in assoc(t, :assignment),
             join: o in assoc(a, :account),
             where: t.id == ^uuid and t.account_id == ^account_id and o.is_active,
             preload: [assignment: a]
           ),
         query = if(opts[:lock], do: lock(query, "FOR UPDATE OF a0"), else: query),
         %AssignmentAttempt{} = attempt <- Repo.one(query) do
      {:ok, attempt}
    else
      _ -> {:error, :not_found}
    end
  end

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)
end
