import Config

if config_env() == :prod do
  database_url =
    StabileoUtils.fetch_env!("DATABASE_URL", "For example: ecto://USER:PASS@HOST/DATABASE")

  config :stabileo_repo, StabileoRepo.Repo,
    url: database_url,
    ssl: StabileoUtils.fetch_env("DATABASE_SSL") == "true",
    pool_size: StabileoUtils.fetch_env_integer("POOL_SIZE", 10)

  # The proxies whose X-Forwarded-For entries are believed (StabileoRepo.Plugs.RequestMetadata).
  config :stabileo_repo,
    trusted_proxies:
      "TRUSTED_PROXIES"
      |> StabileoUtils.fetch_env("")
      |> String.split(",", trim: true)
      |> Enum.map(&String.trim/1)

  secret_key_base =
    StabileoUtils.fetch_env!(
      "SECRET_KEY_BASE",
      "You can generate one by running: mix phx.gen.secret"
    )

  host = StabileoUtils.fetch_env!("PHX_HOST")
  port = StabileoUtils.fetch_env_integer("PORT", 4100)
  bind_address = StabileoUtils.fetch_env("BIND_ADDRESS", "127.0.0.1")

  bind_ip =
    case bind_address |> String.to_charlist() |> :inet.parse_address() do
      {:ok, ip} ->
        ip

      {:error, _} ->
        raise "environment variable BIND_ADDRESS must be an IP address, got #{inspect(bind_address)}"
    end

  config :stabileo_web, StabileoWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [ip: bind_ip, port: port],
    secret_key_base: secret_key_base,
    server: true

  config :stabileo_auth,
    jwt_secret:
      StabileoUtils.fetch_env!(
        "JWT_SECRET",
        "You can generate one by running: mix phx.gen.secret 64"
      ),
    access_token_ttl: StabileoUtils.fetch_env_integer("ACCESS_TOKEN_TTL", 900),
    refresh_token_ttl: StabileoUtils.fetch_env_integer("REFRESH_TOKEN_TTL", 604_800),
    admin_refresh_token_ttl: StabileoUtils.fetch_env_integer("ADMIN_REFRESH_TOKEN_TTL", 14_400),
    admin_password_login: false,
    admin_frontend_url:
      StabileoUtils.fetch_env!("ADMIN_FRONTEND_URL", "The URL the admin site is served from."),
    admin_domains:
      "ADMIN_DOMAINS"
      |> StabileoUtils.fetch_env("lambdaclass.com,ergodicgroup.com")
      |> String.split(",", trim: true)
      |> Enum.map(&String.trim/1)

  config :stabileo_auth, :google_oauth,
    client_id: StabileoUtils.fetch_env("GOOGLE_CLIENT_ID"),
    client_secret: StabileoUtils.fetch_env("GOOGLE_CLIENT_SECRET"),
    redirect_uri:
      StabileoUtils.fetch_env!("API_URL", "The public URL of this backend.") <>
        "/api/v1/admin/auth/google/callback"

  config :cors_plug,
    origin:
      "CORS_ALLOWED_ORIGINS"
      |> StabileoUtils.fetch_env("")
      |> String.split(",", trim: true)
      |> Enum.map(&String.trim/1)
end
