defmodule StabileoRepo.Repo do
  use Ecto.Repo,
    otp_app: :stabileo_repo,
    adapter: Ecto.Adapters.Postgres

  @doc "Migration defaults: UUID primary and foreign keys, UTC timestamps."
  def default_options(_operation) do
    [
      migration_primary_key: [type: :binary_id],
      migration_foreign_key: [type: :binary_id],
      migration_timestamps: [type: :utc_datetime]
    ]
  end
end
