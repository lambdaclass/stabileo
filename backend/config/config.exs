import Config

config :stabileo_repo, ecto_repos: [StabileoRepo.Repo]

config :stabileo_repo, StabileoRepo.Repo,
  migration_primary_key: [type: :binary_id],
  migration_foreign_key: [type: :binary_id],
  migration_timestamps: [type: :utc_datetime]

config :stabileo_web,
  ecto_repos: [StabileoRepo.Repo],
  generators: [context_app: false]

config :stabileo_web, StabileoWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: StabileoWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Stabileo.PubSub

config :phoenix, :json_library, Jason

config :logger, :console,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id, :account_id]

cors_headers = [
  "Authorization",
  "Content-Type",
  "Accept",
  "Origin",
  "X-Client-Version",
  "X-Request-Id"
]

config :cors_plug,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  headers: cors_headers,
  expose: ["X-App-Version"]

import_config "#{config_env()}.exs"
