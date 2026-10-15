import Config

instance = System.get_env("INST", "0") |> String.to_integer()
inst_suffix = if instance == 0, do: "", else: "_#{instance}"

config :stabileo_repo, StabileoRepo.Repo,
  username: System.get_env("PGUSER", "postgres"),
  password: System.get_env("PGPASSWORD", "postgres"),
  hostname: System.get_env("PGHOST", "localhost"),
  port: String.to_integer(System.get_env("PGPORT", "5452")),
  database: "stabileo_test#{System.get_env("MIX_TEST_PARTITION")}#{inst_suffix}",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

config :stabileo_web, StabileoWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4102 + instance * 10],
  secret_key_base:
    "test-secret-key-base-must-be-at-least-64-bytes-long-for-security-purposes-test",
  server: false

config :stabileo_auth,
  jwt_secret: "test-jwt-secret-key-must-be-at-least-32-bytes-long",
  access_token_ttl: 900,
  refresh_token_ttl: 604_800,
  admin_refresh_token_ttl: 14_400,
  admin_emails: ["admin@example.com"]

config :logger, level: :warning

config :phoenix, :plug_init_mode, :runtime

config :cors_plug, origin: ["http://localhost:4000"]

# These keys in config.exs or runtime.exs would hand production a 1-round password hash.
config :argon2_elixir, t_cost: 1, m_cost: 8
