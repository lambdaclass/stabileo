defmodule Stabileo.MixProject do
  use Mix.Project

  def project do
    [
      apps_path: "apps",
      version: "0.1.0",
      start_permanent: Mix.env() == :prod,
      deps: deps(),
      aliases: aliases(),
      releases: releases(),
      listeners: [Phoenix.CodeReloader],
      test_paths: ["apps/*/test"]
    ]
  end

  defp deps do
    [
      {:credo, "~> 1.7", only: [:dev, :test], runtime: false}
    ]
  end

  defp aliases do
    [
      setup: ["deps.get", "ecto.setup"],
      "ecto.setup": [
        "ecto.create",
        "ecto.migrate",
        "run apps/stabileo_repo/priv/repo/seeds.exs"
      ],
      "ecto.reset": ["ecto.drop", "ecto.setup"],
      test: ["ecto.create --quiet", "ecto.migrate --quiet", "test"]
    ]
  end

  defp releases do
    [
      stabileo: [
        applications: [
          stabileo_repo: :permanent,
          stabileo_auth: :permanent,
          stabileo_projects: :permanent,
          stabileo_insights: :permanent,
          stabileo_web: :permanent
        ],
        include_executables_for: [:unix],
        rel_templates_path: "rel"
      ]
    ]
  end
end
