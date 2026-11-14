defmodule StabileoMarketing.AdminRouter do
  @moduledoc "Mounted at /api/v1/admin/marketing by `StabileoWeb.Router`."

  use Phoenix.Router, helpers: false

  import Phoenix.Controller

  pipeline :api do
    plug(:accepts, ["json"])
    plug(StabileoUtils.Plugs.VersionHeader)
    plug(StabileoRepo.Plugs.RequestMetadata)
    plug(StabileoAuth.Plugs.Authenticate, app: "admin")
  end

  scope "/", StabileoMarketing.Controllers.Admin do
    pipe_through(:api)

    get("/settings", SettingsController, :show)
    get("/acquisition", AcquisitionController, :show)
  end
end
