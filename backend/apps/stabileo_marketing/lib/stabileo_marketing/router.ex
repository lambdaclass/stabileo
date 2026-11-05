defmodule StabileoMarketing.Router do
  @moduledoc "Mounted at /api/v1/marketing by `StabileoWeb.Router`."

  use Phoenix.Router, helpers: false

  import Phoenix.Controller

  pipeline :api do
    plug(:accepts, ["json"])
    plug(StabileoUtils.Plugs.VersionHeader)
    plug(StabileoRepo.Plugs.RequestMetadata)
  end

  pipeline :authenticated do
    plug(StabileoAuth.Plugs.Authenticate)
    plug(StabileoUtils.Plugs.RateLimit, bucket: :marketing_activity, limit: 30, period_ms: 60_000)
  end

  scope "/", StabileoMarketing.Controllers do
    pipe_through(:api)

    get("/tracking", TrackingController, :show)
  end

  scope "/", StabileoMarketing.Controllers do
    pipe_through([:api, :authenticated])

    post("/activity", ActivityController, :create)
  end
end
