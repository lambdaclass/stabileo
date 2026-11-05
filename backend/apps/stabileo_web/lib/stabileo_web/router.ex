defmodule StabileoWeb.Router do
  use StabileoWeb, :router

  pipeline :api do
    plug(:accepts, ["json"])
    plug(StabileoUtils.Plugs.VersionHeader)
    plug(StabileoRepo.Plugs.RequestMetadata)
  end

  scope "/api/v1", StabileoWeb do
    pipe_through(:api)

    get("/health", HealthController, :index)
  end

  forward("/api/v1/auth", StabileoAuth.Router)
  forward("/api/v1/projects", StabileoProjects.Router)
  forward("/api/v1/insights", StabileoInsights.Router)
  forward("/api/v1/admin/projects", StabileoProjects.AdminRouter)
  forward("/api/v1/admin/insights", StabileoInsights.AdminRouter)
  forward("/api/v1/admin", StabileoAuth.AdminRouter)
end
