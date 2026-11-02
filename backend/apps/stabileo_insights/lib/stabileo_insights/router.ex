defmodule StabileoInsights.Router do
  @moduledoc """
  Mounted at /api/v1/insights by `StabileoWeb.Router`. Usage events come from
  anonymous browsers; feedback needs a signed-in account, so the open endpoint
  cannot be used to fill the inbox.
  """

  use Phoenix.Router, helpers: false

  import Phoenix.Controller

  pipeline :api do
    plug(:accepts, ["json"])
    plug(StabileoUtils.Plugs.VersionHeader)
    plug(StabileoRepo.Plugs.RequestMetadata)
  end

  pipeline :usage_rate_limit do
    plug(StabileoInsights.Plugs.RateLimit, scope: :usage_events, limit: 300)
  end

  pipeline :feedback_rate_limit do
    plug(StabileoInsights.Plugs.RateLimit, scope: :feedback, limit: 10)
  end

  pipeline :authenticated do
    plug(StabileoAuth.Plugs.Authenticate)
  end

  scope "/", StabileoInsights.Controllers do
    pipe_through([:api, :usage_rate_limit])

    post("/events", UsageController, :create)
  end

  scope "/", StabileoInsights.Controllers do
    pipe_through([:api, :authenticated, :feedback_rate_limit])

    post("/feedback", FeedbackController, :create)
  end
end
