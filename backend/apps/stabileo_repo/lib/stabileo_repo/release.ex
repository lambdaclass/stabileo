defmodule StabileoRepo.Release do
  @moduledoc """
  Release tasks, run with `./bin/stabileo eval "StabileoRepo.Release.migrate()"`.
  """

  @app :stabileo_repo

  def migrate do
    load_app()

    for repo <- repos() do
      {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
    end
  end

  def rollback(repo, version) do
    load_app()

    {:ok, _, _} =
      Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :down, to_exclusive: version))
  end

  @doc "Drops, creates, migrates and seeds the database."
  def reset do
    load_app()

    for repo <- repos() do
      case repo.__adapter__().storage_down(repo.config()) do
        :ok -> IO.puts("Database dropped")
        {:error, :already_down} -> IO.puts("Database already down")
        {:error, reason} -> IO.puts("Error dropping database: #{inspect(reason)}")
      end

      case repo.__adapter__().storage_up(repo.config()) do
        :ok -> IO.puts("Database created")
        {:error, :already_up} -> IO.puts("Database already exists")
        {:error, reason} -> raise "Error creating database: #{inspect(reason)}"
      end

      {:ok, _, _} = Ecto.Migrator.with_repo(repo, &Ecto.Migrator.run(&1, :up, all: true))
      IO.puts("Migrations complete")
    end

    seed()
  end

  def seed do
    load_app()
    {:ok, _} = Application.ensure_all_started(:stabileo_web)

    seeds_path = Path.join(:code.priv_dir(:stabileo_repo), "repo/seeds.exs")

    if File.exists?(seeds_path) do
      IO.puts("Running seeds from: #{seeds_path}")
      Code.eval_file(seeds_path)
      IO.puts("Seeds complete")
    else
      IO.puts("No seeds file found at: #{seeds_path}")
    end
  end

  defp repos do
    Application.fetch_env!(@app, :ecto_repos)
  end

  defp load_app do
    Application.load(@app)
  end
end
