defmodule StabileoMarketing.Router do
  @moduledoc """
  Mounted at /api/v1/marketing by `StabileoWeb.Router`. The tracking ids are
  public, since every browser that loads the pixel needs them; an account's
  activity needs its session.
  """

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

  scope "/", StabileoMarketing.Controllers do
    pipe_through(:api)

    get("/tracking", TrackingController, :show)
  end

  scope "/", StabileoMarketing.Controllers do
    pipe_through([:api, :authenticated])

    post("/activity", ActivityController, :create)
  end
end
