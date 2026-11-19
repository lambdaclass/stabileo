defmodule StabileoAssignments.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children =
      if Application.get_env(:stabileo_assignments, :retention, true),
        do: [StabileoAssignments.Retention],
        else: []

    Supervisor.start_link(children, strategy: :one_for_one, name: StabileoAssignments.Supervisor)
  end
end
