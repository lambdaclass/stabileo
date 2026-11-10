defmodule StabileoAssignments.Controllers.ExamController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoAssignments.{AssignmentJSON, Exams}

  def show(conn, %{"code" => code}) do
    with {:ok, exam} <- Exams.exam(conn.assigns.current_account, code) do
      json(conn, %{data: AssignmentJSON.exam(exam, now())})
    end
  end

  def start(conn, %{"code" => code}) do
    now = now()

    with {:ok, row} <- Exams.start(conn.assigns.current_account, code, now) do
      json(conn, %{data: AssignmentJSON.attempt(row, now)})
    end
  end

  def attempt(conn, %{"id" => id}) do
    with {:ok, row} <- Exams.get(conn.assigns.current_account, id) do
      json(conn, %{data: AssignmentJSON.attempt(row, now())})
    end
  end

  def answers(conn, %{"id" => id} = params) do
    now = now()

    with {:ok, row} <- Exams.save_answers(conn.assigns.current_account, id, params, now) do
      json(conn, %{data: AssignmentJSON.attempt(row, now)})
    end
  end

  def submit(conn, %{"id" => id} = params) do
    now = now()

    with {:ok, row} <- Exams.submit(conn.assigns.current_account, id, params, now) do
      json(conn, %{data: AssignmentJSON.attempt(row, now)})
    end
  end

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)
end
