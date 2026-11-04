import Config

instance = System.get_env("INST", "0") |> String.to_integer()

db_name =
  if instance == 0,
    do: "stabileo_dev",
    else: "stabileo_dev_#{instance}"

backend_port = 4100 + instance * 10
web_port = 4000 + instance * 10
admin_port = 4001 + instance * 10

config :stabileo_repo, StabileoRepo.Repo,
  username: System.get_env("PGUSER", "postgres"),
  password: System.get_env("PGPASSWORD", "postgres"),
  hostname: System.get_env("PGHOST", "localhost"),
  port: String.to_integer(System.get_env("PGPORT", "5452")),
  database: System.get_env("DEV_DB", db_name),
  stacktrace: true,
  show_sensitive_data_on_connection_error: true,
  pool_size: 10

bind_ip = if System.get_env("BIND") == "all", do: {0, 0, 0, 0}, else: {127, 0, 0, 1}

config :stabileo_web, StabileoWeb.Endpoint,
  http: [ip: bind_ip, port: String.to_integer(System.get_env("PORT", "#{backend_port}"))],
  check_origin: false,
  code_reloader: true,
  debug_errors: true,
  secret_key_base:
    "dev-secret-key-base-must-be-at-least-64-bytes-long-for-security-purposes-here",
  watchers: []

config :stabileo_auth,
  jwt_secret: "dev-jwt-secret-key-must-be-at-least-32-bytes-long",
  access_token_ttl: 900,
  refresh_token_ttl: 604_800,
  admin_refresh_token_ttl: 14_400,
  admin_domains: ["lambdaclass.com", "ergodicgroup.com", "stabileo.com"],
  admin_password_login: true,
  admin_frontend_url: "http://localhost:#{admin_port}"

config :stabileo_auth, :google_oauth,
  client_id: System.get_env("GOOGLE_CLIENT_ID", ""),
  client_secret: System.get_env("GOOGLE_CLIENT_SECRET", ""),
  redirect_uri: "http://localhost:#{backend_port}/api/v1/admin/auth/google/callback"

config :logger, :console, format: "[$level] $message\n"

config :phoenix, :stacktrace_depth, 20

config :phoenix, :plug_init_mode, :runtime

config :cors_plug,
  origin: [
    "http://localhost:#{web_port}",
    "http://localhost:#{admin_port}",
    "http://localhost:4173"
  ]
