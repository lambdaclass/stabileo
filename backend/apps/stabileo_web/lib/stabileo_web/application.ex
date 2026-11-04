defmodule StabileoWeb.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    Supervisor.start_link([StabileoWeb.Endpoint],
      strategy: :one_for_one,
      name: StabileoWeb.Supervisor
    )
  end

  @impl true
  def config_change(changed, _new, removed) do
    StabileoWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
