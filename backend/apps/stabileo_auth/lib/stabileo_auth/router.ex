defmodule StabileoAuth.Router do
  @moduledoc "Mounted at /api/v1/auth by `StabileoWeb.Router`."

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

  scope "/", StabileoAuth.Controllers do
    pipe_through(:api)

    post("/register", AuthController, :register)
    post("/login", AuthController, :login)
    post("/refresh", AuthController, :refresh)
    delete("/logout", AuthController, :logout)
  end

  scope "/", StabileoAuth.Controllers do
    pipe_through([:api, :authenticated])

    get("/me", ProfileController, :show)
    put("/me", ProfileController, :update)
    put("/password", PasswordController, :update)
  end
end
