defmodule StabileoProjects.Controllers.Admin.ProjectController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoProjects.{ProjectJSON, Projects}

  def index(conn, params) do
    {rows, meta} = Projects.admin_list(params)
    json(conn, %{data: Enum.map(rows, &row_json/1), meta: meta})
  end

  defp row_json({project, account, research}) do
    project
    |> ProjectJSON.metadata()
    |> Map.merge(%{
      owner: %{id: account.id, email: account.email, name: account.name},
      research_consent: research
    })
  end
end
