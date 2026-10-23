defmodule StabileoAuth.MixProject do
  use Mix.Project

  def project do
    [
      app: :stabileo_auth,
      version: "0.1.0",
      build_path: "../../_build",
      config_path: "../../config/config.exs",
      deps_path: "../../deps",
      lockfile: "../../mix.lock",
      elixir: "~> 1.18",
      elixirc_paths: elixirc_paths(Mix.env()),
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  def application do
    [
      extra_applications: [:logger]
    ]
  end

  defp elixirc_paths(:test), do: ["lib", "test/support"]
  defp elixirc_paths(_), do: ["lib"]

  defp deps do
    [
      {:stabileo_repo, in_umbrella: true},
      {:stabileo_utils, in_umbrella: true},
      {:phoenix, "~> 1.7"},
      {:joken, "~> 2.6"},
      {:assent, "~> 0.3"},
      {:jason, "~> 1.4"}
    ]
  end
end
