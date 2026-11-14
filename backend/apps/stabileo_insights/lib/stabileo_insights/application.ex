defmodule StabileoInsights.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children =
      if Application.get_env(:stabileo_insights, :retention, true),
        do: [StabileoInsights.Retention],
        else: []

    Supervisor.start_link(children, strategy: :one_for_one, name: StabileoInsights.Supervisor)
  end
end
