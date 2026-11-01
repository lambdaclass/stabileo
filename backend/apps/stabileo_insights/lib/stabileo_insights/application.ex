defmodule StabileoInsights.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    Supervisor.start_link([StabileoInsights.RateLimit],
      strategy: :one_for_one,
      name: StabileoInsights.Supervisor
    )
  end
end
