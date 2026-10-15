defmodule StabileoAuth.AdminRouter do
  @moduledoc "Mounted at /api/v1/admin by `StabileoWeb.Router`."

  use Phoenix.Router, helpers: false

  import Phoenix.Controller

  pipeline :api do
    plug(:accepts, ["json"])
    plug(StabileoUtils.Plugs.VersionHeader)
    plug(StabileoRepo.Plugs.RequestMetadata)
  end

  pipeline :admin_authenticated do
    plug(StabileoAuth.Plugs.Authenticate, app: "admin")
  end

  scope "/auth", StabileoAuth.Controllers.Admin do
    pipe_through(:api)

    post("/login", AuthController, :login)
    post("/refresh", AuthController, :refresh)
    delete("/logout", AuthController, :logout)
  end

  scope "/", StabileoAuth.Controllers.Admin do
    pipe_through([:api, :admin_authenticated])

    get("/auth/me", AuthController, :me)

    get("/users", UserController, :index)
    get("/users/:id", UserController, :show)
    post("/users/:id/disable", UserController, :disable)
    post("/users/:id/enable", UserController, :enable)
    post("/users/:id/force-logout", UserController, :force_logout)
  end
end
