defmodule StabileoInsights.UsagePruner do
  @moduledoc """
  Deletes usage events past the published retention once a day, the first
  time a minute after boot. Off when `config :stabileo_insights,
  prune_usage: false`.
  """

  use GenServer

  require Logger

  alias StabileoInsights.Usage

  @first_ms 60_000
  @every_ms 24 * 3600 * 1000

  def start_link(opts), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  @impl true
  def init(opts) do
    Process.send_after(self(), :prune, Keyword.get(opts, :first_ms, @first_ms))
    {:ok, Keyword.get(opts, :every_ms, @every_ms)}
  end

  @impl true
  def handle_info(:prune, every_ms) do
    run()
    Process.send_after(self(), :prune, every_ms)
    {:noreply, every_ms}
  end

  @doc "One pass: how many events it deleted, or `:error` (logged) when the delete failed."
  def run do
    count = Usage.prune()
    Logger.info("usage pruner: deleted #{count} events past retention")
    count
  rescue
    e ->
      Logger.error("usage pruner failed: #{Exception.message(e)}")
      :error
  end
end
