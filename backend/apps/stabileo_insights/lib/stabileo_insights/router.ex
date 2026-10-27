defmodule StabileoInsights.Router do
  @moduledoc "Mounted at /api/v1/insights by `StabileoWeb.Router`. Open to anonymous browsers."

  use Phoenix.Router, helpers: false

  import Phoenix.Controller

  pipeline :api do
    plug(:accepts, ["json"])
    plug(StabileoUtils.Plugs.VersionHeader)
    plug(StabileoRepo.Plugs.RequestMetadata)
    plug(StabileoInsights.Plugs.MaybeAccount)
  end

  scope "/", StabileoInsights.Controllers do
    pipe_through(:api)

    post("/events", UsageController, :create)
    post("/feedback", FeedbackController, :create)
  end
end
