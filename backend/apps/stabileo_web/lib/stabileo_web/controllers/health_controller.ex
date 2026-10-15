defmodule StabileoWeb.HealthController do
  use StabileoUtils.Controller

  alias StabileoUtils.BuildInfo

  @db_timeout 3_000

  @doc """
  Health check - returns version info, database status, and migration status.
  """
  def index(conn, _params) do
    db_check = check_database()
    migrations_check = check_migrations(db_check)

    overall_status = overall_status(db_check, migrations_check)
    http_status = if overall_status == "fail", do: :service_unavailable, else: :ok

    conn
    |> put_status(http_status)
    |> json(%{
      status: overall_status,
      version: BuildInfo.version(),
      commit: BuildInfo.commit(),
      environment: BuildInfo.environment(),
      server_time: DateTime.utc_now(),
      checks: %{
        database: format_db_check(db_check),
        migrations: format_migrations_check(migrations_check)
      }
    })
  end

  defp check_database do
    start = System.monotonic_time(:millisecond)

    %{rows: rows} =
      StabileoRepo.Repo.query!("SELECT version FROM schema_migrations", [], timeout: @db_timeout)

    elapsed = System.monotonic_time(:millisecond) - start
    {:ok, elapsed, MapSet.new(rows, fn [version] -> version end)}
  rescue
    e in DBConnection.ConnectionError ->
      if e.message =~ "timeout", do: {:timeout, @db_timeout}, else: {:error, Exception.message(e)}

    e ->
      {:error, Exception.message(e)}
  end

  defp check_migrations({:ok, _elapsed, applied_versions}) do
    case Enum.count(migration_file_versions(), &(not MapSet.member?(applied_versions, &1))) do
      0 -> {:ok, 0}
      pending -> {:warn, pending}
    end
  end

  defp check_migrations(_db_check), do: {:ok, 0}

  @doc false
  def migration_file_versions do
    key = {__MODULE__, :migration_file_versions}

    case :persistent_term.get(key, nil) do
      nil ->
        versions = read_migration_file_versions()
        :persistent_term.put(key, versions)
        versions

      versions ->
        versions
    end
  end

  defp read_migration_file_versions do
    migrations_path()
    |> Path.join("**/*.exs")
    |> Path.wildcard()
    |> Enum.flat_map(fn file ->
      case Regex.run(~r/^(\d+)_\w+\.exs$/, Path.basename(file)) do
        [_, version] -> [String.to_integer(version)]
        nil -> []
      end
    end)
  end

  defp overall_status(db_check, migrations_check) do
    cond do
      match?({:error, _}, db_check) or match?({:timeout, _}, db_check) -> "fail"
      match?({:warn, _}, migrations_check) -> "warn"
      true -> "pass"
    end
  end

  defp format_db_check({:ok, ms, _versions}), do: %{status: "pass", response_time_ms: ms}
  defp format_db_check({:timeout, ms}), do: %{status: "fail", error: "timeout", timeout_ms: ms}
  defp format_db_check({:error, reason}), do: %{status: "fail", error: reason}

  defp format_migrations_check({:ok, 0}), do: %{status: "pass", pending: 0}
  defp format_migrations_check({:warn, count}), do: %{status: "warn", pending: count}

  defp migrations_path, do: Application.app_dir(:stabileo_repo, "priv/repo/migrations")
end
