defmodule StabileoProjects.Router do
  @moduledoc "Mounted at /api/v1/projects by `StabileoWeb.Router`."

  use Phoenix.Router, helpers: false

  import Phoenix.Controller

  pipeline :api do
    plug(:accepts, ["json"])
    plug(StabileoUtils.Plugs.VersionHeader)
    plug(StabileoRepo.Plugs.RequestMetadata)
    plug(StabileoAuth.Plugs.Authenticate)
  end

  scope "/", StabileoProjects.Controllers do
    pipe_through(:api)

    get("/", ProjectController, :index)
    post("/", ProjectController, :create)
    get("/:id", ProjectController, :show)
    put("/:id", ProjectController, :update)
    delete("/:id", ProjectController, :delete)
  end
end
