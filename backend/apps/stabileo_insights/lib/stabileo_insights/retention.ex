defmodule StabileoInsights.Retention do
  @moduledoc false

  use GenServer

  require Logger

  alias StabileoInsights.Usage

  @every :timer.hours(24)
  @first :timer.minutes(5)

  def start_link(_opts), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @impl true
  def init(nil) do
    Process.send_after(self(), :prune, @first)
    {:ok, nil}
  end

  @impl true
  def handle_info(:prune, state) do
    run()
    Process.send_after(self(), :prune, @every)
    {:noreply, state}
  end

  def run do
    count = Usage.prune()
    if count > 0, do: Logger.info("usage retention deleted #{count} events")
    count
  rescue
    error ->
      Logger.error("usage retention failed: #{Exception.message(error)}")
      0
  end
end
