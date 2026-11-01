defmodule StabileoProjects.ProjectJSON do
  @moduledoc false

  alias StabileoProjects.Projects

  def metadata(project) do
    %{
      id: project.id,
      name: project.name,
      app_mode: project.app_mode,
      content_bytes: project.content_bytes,
      node_count: project.node_count,
      element_count: project.element_count,
      app_version: project.app_version,
      inserted_at: project.inserted_at,
      updated_at: project.updated_at
    }
  end

  def full(project), do: Map.put(metadata(project), :content, Projects.decoded_content(project))
end
