defmodule StabileoInsights.AdminRouter do
  @moduledoc "Mounted at /api/v1/admin/insights by `StabileoWeb.Router`."

  use Phoenix.Router, helpers: false

  import Phoenix.Controller

  pipeline :api do
    plug(:accepts, ["json"])
    plug(StabileoUtils.Plugs.VersionHeader)
    plug(StabileoRepo.Plugs.RequestMetadata)
    plug(StabileoAuth.Plugs.Authenticate, app: "admin")
  end

  scope "/", StabileoInsights.Controllers.Admin do
    pipe_through(:api)

    get("/summary", InsightsController, :summary)
    get("/feedback", InsightsController, :feedback)
    put("/feedback/:id", InsightsController, :update_feedback)
  end
end
