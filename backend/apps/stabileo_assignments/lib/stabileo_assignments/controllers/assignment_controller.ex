defmodule StabileoAssignments.Controllers.AssignmentController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoAssignments.{AssignmentJSON, Assignments}

  def index(conn, params) do
    with {:ok, {rows, meta}} <- Assignments.list(conn.assigns.current_account, params) do
      json(conn, %{
        data: Enum.map(rows, &AssignmentJSON.assignment/1),
        meta: Map.merge(meta, Assignments.limits())
      })
    end
  end

  def create(conn, params) do
    with {:ok, row} <- Assignments.create(conn.assigns.current_account, params) do
      conn
      |> put_status(:created)
      |> json(%{data: AssignmentJSON.full(row)})
    end
  end

  def show(conn, %{"id" => id}) do
    with {:ok, row} <- Assignments.get(conn.assigns.current_account, id) do
      json(conn, %{data: AssignmentJSON.full(row)})
    end
  end

  def update(conn, %{"id" => id} = params) do
    with {:ok, row} <- Assignments.update(conn.assigns.current_account, id, params) do
      json(conn, %{data: AssignmentJSON.full(row)})
    end
  end

  def delete(conn, %{"id" => id}) do
    with {:ok, row} <- Assignments.delete(conn.assigns.current_account, id) do
      json(conn, %{data: AssignmentJSON.assignment(row)})
    end
  end

  def attempts(conn, %{"id" => id} = params) do
    with {:ok, {rows, meta}} <- Assignments.attempts(conn.assigns.current_account, id, params) do
      json(conn, %{data: Enum.map(rows, &AssignmentJSON.owner_attempt/1), meta: meta})
    end
  end
end
