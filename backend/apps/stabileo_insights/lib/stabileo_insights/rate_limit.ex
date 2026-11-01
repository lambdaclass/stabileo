defmodule StabileoInsights.RateLimit do
  @moduledoc """
  Fixed-window request counters per key, in an ETS table owned by this
  process. Counts live in this node only, so a cluster of `n` nodes lets
  through up to `n` times the limit.
  """

  use GenServer

  @table :stabileo_insights_rate_limit
  @sweep_ms 60_000

  def start_link(_opts), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @doc "Counts one hit for `key` in the current window; `:ok` while at most `limit` hits."
  def hit(key, limit, window_ms) do
    window = div(System.monotonic_time(:millisecond), window_ms)
    count = :ets.update_counter(@table, {key, window}, 1, {{key, window}, 0, window_ms})
    if count <= limit, do: :ok, else: {:error, :rate_limited}
  end

  @impl true
  def init(nil) do
    :ets.new(@table, [:named_table, :public, :set, write_concurrency: true])
    schedule()
    {:ok, nil}
  end

  @impl true
  def handle_info(:sweep, state) do
    now = System.monotonic_time(:millisecond)

    :ets.select_delete(@table, [
      {{{:_, :"$1"}, :_, :"$2"}, [{:<, {:*, {:+, :"$1", 1}, :"$2"}, now}], [true]}
    ])

    schedule()
    {:noreply, state}
  end

  defp schedule, do: Process.send_after(self(), :sweep, @sweep_ms)
end
