defmodule StabileoProjects.Controllers.ProjectController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoProjects.{ProjectJSON, Projects}

  def index(conn, params) do
    with {:ok, {rows, meta}} <- Projects.list(conn.assigns.current_account, params) do
      json(conn, %{
        data: Enum.map(rows, &ProjectJSON.metadata/1),
        meta: Map.merge(meta, Projects.limits())
      })
    end
  end

  def show(conn, %{"id" => id}) do
    with {:ok, project} <- Projects.get(conn.assigns.current_account, id) do
      json(conn, %{data: ProjectJSON.full(project)})
    end
  end

  def create(conn, params) do
    with {:ok, project} <- Projects.create(conn.assigns.current_account, params) do
      conn
      |> put_status(:created)
      |> json(%{data: ProjectJSON.metadata(project)})
    end
  end

  def update(conn, %{"id" => id} = params) do
    with {:ok, project} <- Projects.update(conn.assigns.current_account, id, params) do
      json(conn, %{data: ProjectJSON.metadata(project)})
    end
  end

  def delete(conn, %{"id" => id}) do
    with {:ok, project} <- Projects.delete(conn.assigns.current_account, id) do
      json(conn, %{data: ProjectJSON.metadata(project)})
    end
  end
end
