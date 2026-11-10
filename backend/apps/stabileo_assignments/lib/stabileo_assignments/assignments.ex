defmodule StabileoAssignments.Assignments do
  @moduledoc false

  import Ecto.Query

  alias StabileoRepo.{Features, Listing, Repo}
  alias StabileoRepo.Schemas.{Account, Assignment, AssignmentAttempt}

  @max_assignments 100
  @retention_days 365
  @code_alphabet ~c"23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
  @sortable [:inserted_at, :updated_at, :title, :opens_at, :closes_at]
  @attempt_sortable [:started_at, :submitted_at, :client_score]
  @input ~w(title exercise duration_minutes opens_at closes_at reveal)

  def limits, do: %{max_assignments: @max_assignments}

  def enabled do
    if Features.assignments_enabled?(), do: :ok, else: {:error, :assignments_disabled}
  end

  def list(%Account{id: account_id}, params) do
    with :ok <- enabled() do
      query =
        from(a in Assignment, where: a.account_id == ^account_id)
        |> search_title(params["search"])

      {rows, meta} = Listing.paginate(query, params, @sortable, :inserted_at, default_dir: :desc)
      counts = counts(Enum.map(rows, & &1.id))
      {:ok, {Enum.map(rows, &{&1, Map.fetch!(counts, &1.id)}), meta}}
    end
  end

  def get(%Account{} = account, id) do
    with :ok <- enabled(),
         {:ok, assignment} <- fetch(account, id) do
      {:ok, with_counts(assignment)}
    end
  end

  @doc "Counts under an advisory lock on the account, so two creates at once cannot pass the limit."
  def create(%Account{id: account_id}, params, now \\ now()) do
    with :ok <- enabled() do
      attrs =
        params
        |> attrs()
        |> Map.put_new(:opens_at, now)
        |> Map.merge(%{account_id: account_id, code: unused_code()})

      Repo.transaction(fn -> insert_locked(account_id, attrs) end)
      |> case do
        {:ok, assignment} -> {:ok, {assignment, %{attempts: 0, submitted: 0}}}
        error -> error
      end
    end
  end

  defp insert_locked(account_id, attrs) do
    Repo.query!("SELECT pg_advisory_xact_lock(hashtext($1))", ["assignments:" <> account_id])

    with :ok <- below_limit(account_id),
         {:ok, assignment} <- %Assignment{} |> Assignment.create_changeset(attrs) |> Repo.insert() do
      assignment
    else
      {:error, reason} -> Repo.rollback(reason)
    end
  end

  @doc "Locks the row, so an attempt cannot start between the check for attempts and the new exercise."
  def update(%Account{} = account, id, params) do
    with :ok <- enabled() do
      Repo.transaction(fn -> update_locked(account, id, attrs(params)) end)
    end
  end

  defp update_locked(account, id, attrs) do
    with {:ok, assignment} <- fetch(account, id, lock: true),
         :ok <- exercise_editable(assignment, attrs),
         {:ok, updated} <- assignment |> Assignment.update_changeset(attrs) |> Repo.update() do
      with_counts(updated)
    else
      {:error, reason} -> Repo.rollback(reason)
    end
  end

  def delete(%Account{} = account, id) do
    with :ok <- enabled(),
         {:ok, assignment} <- fetch(account, id) do
      {assignment, counts} = with_counts(assignment)
      {:ok, deleted} = Repo.delete(assignment)
      {:ok, {deleted, counts}}
    end
  end

  def attempts(%Account{} = account, id, params) do
    with :ok <- enabled(),
         {:ok, assignment} <- fetch(account, id) do
      query =
        from(t in AssignmentAttempt,
          join: s in assoc(t, :account),
          where: t.assignment_id == ^assignment.id,
          select: {t, s}
        )
        |> search_student(params["search"])

      {:ok, Listing.paginate(query, params, @attempt_sortable, :started_at)}
    end
  end

  @doc "Deletes, with their attempts, assignments #{@retention_days} days past `closes_at`, or past `inserted_at` without one."
  def purge_expired(%DateTime{} = now) do
    cutoff = DateTime.add(now, -@retention_days, :day)

    {count, _} =
      Repo.delete_all(
        from(a in Assignment, where: coalesce(a.closes_at, a.inserted_at) < ^cutoff)
      )

    count
  end

  defp exercise_editable(assignment, attrs) do
    changed? = Map.has_key?(attrs, :exercise) and attrs.exercise != assignment.exercise

    if changed? and started?(assignment.id),
      do: {:error, :assignment_started},
      else: :ok
  end

  defp started?(assignment_id),
    do: Repo.exists?(from(t in AssignmentAttempt, where: t.assignment_id == ^assignment_id))

  defp fetch(%Account{id: account_id}, id, opts \\ []) do
    with {:ok, uuid} <- Ecto.UUID.cast(id),
         query = from(a in Assignment, where: a.id == ^uuid and a.account_id == ^account_id),
         query = if(opts[:lock], do: lock(query, "FOR UPDATE"), else: query),
         %Assignment{} = assignment <- Repo.one(query) do
      {:ok, assignment}
    else
      _ -> {:error, :not_found}
    end
  end

  defp with_counts(assignment),
    do: {assignment, Map.fetch!(counts([assignment.id]), assignment.id)}

  defp counts(ids) do
    found =
      from(t in AssignmentAttempt,
        where: t.assignment_id in ^ids,
        group_by: t.assignment_id,
        select:
          {t.assignment_id,
           %{attempts: count(t.id), submitted: filter(count(t.id), not is_nil(t.submitted_at))}}
      )
      |> Repo.all()
      |> Map.new()

    Map.new(ids, &{&1, Map.get(found, &1, %{attempts: 0, submitted: 0})})
  end

  defp attrs(params) do
    params |> Map.take(@input) |> Map.new(fn {k, v} -> {String.to_existing_atom(k), v} end)
  end

  defp below_limit(account_id) do
    count = Repo.aggregate(from(a in Assignment, where: a.account_id == ^account_id), :count)
    if count < @max_assignments, do: :ok, else: {:error, :assignment_limit_reached}
  end

  defp unused_code do
    code = generate_code()

    if Repo.exists?(from(a in Assignment, where: a.code == ^code)),
      do: unused_code(),
      else: code
  end

  defp generate_code do
    <<bits::bitstring-size(50), _::bitstring>> = :crypto.strong_rand_bytes(7)
    for <<i::5 <- bits>>, into: "", do: <<Enum.at(@code_alphabet, i)>>
  end

  defp search_title(query, term) when is_binary(term) and term != "",
    do: where(query, [a], ilike(a.title, ^like(term)))

  defp search_title(query, _term), do: query

  defp search_student(query, term) when is_binary(term) and term != "" do
    pattern = like(term)
    where(query, [_t, s], ilike(s.name, ^pattern) or ilike(s.email, ^pattern))
  end

  defp search_student(query, _term), do: query

  defp like(term), do: "%" <> String.replace(String.trim(term), ~r/[\\%_]/, "\\\\\\0") <> "%"

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)
end
