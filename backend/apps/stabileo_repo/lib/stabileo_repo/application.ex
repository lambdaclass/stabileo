defmodule StabileoRepo.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      {Phoenix.PubSub, name: Stabileo.PubSub},
      StabileoRepo.Repo
    ]

    Supervisor.start_link(children, strategy: :one_for_one, name: StabileoRepo.Supervisor)
  end
end
