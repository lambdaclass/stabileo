defmodule StabileoAssignments.Retention do
  @moduledoc false

  use GenServer

  require Logger

  alias StabileoAssignments.Assignments

  @every :timer.hours(24)
  @first :timer.minutes(5)

  def start_link(_opts), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @impl true
  def init(nil) do
    Process.send_after(self(), :purge, @first)
    {:ok, nil}
  end

  @impl true
  def handle_info(:purge, state) do
    run()
    Process.send_after(self(), :purge, @every)
    {:noreply, state}
  end

  def run do
    count = Assignments.purge_expired(DateTime.utc_now())
    if count > 0, do: Logger.info("assignment retention deleted #{count} assignments")
    count
  rescue
    error ->
      Logger.error("assignment retention failed: #{Exception.message(error)}")
      0
  end
end
