defmodule StabileoAssignments.Router do
  @moduledoc "Mounted at /api/v1/assignments by `StabileoWeb.Router`: the owner's side."

  use Phoenix.Router, helpers: false

  import Phoenix.Controller

  pipeline :api do
    plug(:accepts, ["json"])
    plug(StabileoUtils.Plugs.VersionHeader)
    plug(StabileoRepo.Plugs.RequestMetadata)
    plug(StabileoAuth.Plugs.Authenticate)

    plug(StabileoUtils.Plugs.RateLimit,
      bucket: :assignments,
      limit: 60,
      period_ms: 60_000,
      key: :account
    )
  end

  scope "/", StabileoAssignments.Controllers do
    pipe_through(:api)

    get("/", AssignmentController, :index)
    post("/", AssignmentController, :create)
    get("/:id", AssignmentController, :show)
    put("/:id", AssignmentController, :update)
    delete("/:id", AssignmentController, :delete)
    get("/:id/attempts", AssignmentController, :attempts)
  end
end
