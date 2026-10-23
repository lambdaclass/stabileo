defmodule StabileoWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :stabileo_web

  if code_reloading? do
    plug(Phoenix.CodeReloader)
  end

  plug(Plug.RequestId)
  plug(Plug.Telemetry, event_prefix: [:phoenix, :endpoint])

  plug(Plug.Parsers,
    parsers: [:urlencoded, :json],
    pass: ["*/*"],
    json_decoder: Phoenix.json_library()
  )

  plug(Plug.MethodOverride)

  plug(Plug.Session,
    store: :cookie,
    key: "_stabileo_oauth",
    signing_salt: "admin_oauth",
    same_site: "Lax"
  )

  plug(Plug.Head)
  plug(CORSPlug)
  plug(StabileoWeb.Router)
end
