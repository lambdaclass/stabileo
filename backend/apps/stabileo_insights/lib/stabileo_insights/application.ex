defmodule StabileoInsights.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    pruner =
      if Application.get_env(:stabileo_insights, :prune_usage, true),
        do: [StabileoInsights.UsagePruner],
        else: []

    Supervisor.start_link([StabileoInsights.RateLimit | pruner],
      strategy: :one_for_one,
      name: StabileoInsights.Supervisor
    )
  end
end
