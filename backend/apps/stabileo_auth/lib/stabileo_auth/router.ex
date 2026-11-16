defmodule StabileoAuth.Router do
  @moduledoc "Mounted at /api/v1/auth by `StabileoWeb.Router`."

  use Phoenix.Router, helpers: false

  import Phoenix.Controller

  pipeline :api do
    plug(:accepts, ["json"])
    plug(StabileoUtils.Plugs.VersionHeader)
    plug(StabileoRepo.Plugs.RequestMetadata)
  end

  pipeline :oauth do
    plug(:fetch_session)
    plug(StabileoRepo.Plugs.RequestMetadata)
  end

  pipeline :authenticated do
    plug(StabileoAuth.Plugs.Authenticate)
  end

  scope "/", StabileoAuth.Controllers do
    pipe_through(:api)

    get("/config", AuthController, :config)
    post("/refresh", AuthController, :refresh)
    delete("/logout", AuthController, :logout)
    post("/google/exchange", GoogleController, :exchange)
    post("/google/register", GoogleController, :register)
  end

  scope "/google", StabileoAuth.Controllers do
    pipe_through(:oauth)

    get("/", GoogleController, :request)
    get("/callback", GoogleController, :callback)
    get("/dev", GoogleController, :dev)
  end

  scope "/", StabileoAuth.Controllers do
    pipe_through([:api, :authenticated])

    get("/me", ProfileController, :show)
    put("/me", ProfileController, :update)
    post("/consents", ConsentController, :create)
  end
end
