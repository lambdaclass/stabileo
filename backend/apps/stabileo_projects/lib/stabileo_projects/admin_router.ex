defmodule StabileoProjects.AdminRouter do
  @moduledoc "Mounted at /api/v1/admin/projects by `StabileoWeb.Router`."

  use Phoenix.Router, helpers: false

  import Phoenix.Controller

  pipeline :api do
    plug(:accepts, ["json"])
    plug(StabileoUtils.Plugs.VersionHeader)
    plug(StabileoRepo.Plugs.RequestMetadata)
    plug(StabileoAuth.Plugs.Authenticate, app: "admin")
  end

  scope "/", StabileoProjects.Controllers.Admin do
    pipe_through(:api)

    get("/", ProjectController, :index)
  end
end
