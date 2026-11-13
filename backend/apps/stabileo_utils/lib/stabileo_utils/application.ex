defmodule StabileoUtils.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    Supervisor.start_link([StabileoUtils.RateLimit],
      strategy: :one_for_one,
      name: StabileoUtils.Supervisor
    )
  end
end
