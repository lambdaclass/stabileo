defmodule StabileoInsights.Router do
  @moduledoc "Mounted at /api/v1/insights by `StabileoWeb.Router`."

  use Phoenix.Router, helpers: false

  import Phoenix.Controller

  pipeline :api do
    plug(:accepts, ["json"])
    plug(StabileoUtils.Plugs.VersionHeader)
    plug(StabileoRepo.Plugs.RequestMetadata)
  end

  pipeline :authenticated do
    plug(StabileoAuth.Plugs.Authenticate)
  end

  pipeline :events_limit do
    plug(StabileoUtils.Plugs.RateLimit, bucket: :usage_events, limit: 30, period_ms: 60_000)
  end

  scope "/", StabileoInsights.Controllers do
    pipe_through([:api, :events_limit])

    post("/events", UsageController, :create)
  end

  scope "/", StabileoInsights.Controllers do
    pipe_through([:api, :authenticated])

    post("/feedback", FeedbackController, :create)
  end
end
