defmodule StabileoMarketing.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [{Oban, Application.fetch_env!(:stabileo_marketing, Oban)}]
    Supervisor.start_link(children, strategy: :one_for_one, name: StabileoMarketing.Supervisor)
  end
end
