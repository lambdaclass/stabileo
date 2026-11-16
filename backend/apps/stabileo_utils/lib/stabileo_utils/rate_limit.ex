defmodule StabileoUtils.RateLimit do
  @moduledoc false

  use GenServer

  @table __MODULE__
  @sweep_every :timer.minutes(5)
  @keep_ms :timer.hours(1)

  def start_link(_opts), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @doc "Counts one hit of `key` in `bucket`; `:ok` while the window holds at most `limit` hits."
  def hit(bucket, key, limit, period_ms) do
    if enabled?() do
      now = System.system_time(:millisecond)
      window = div(now, period_ms) * period_ms
      count = :ets.update_counter(@table, {bucket, key, window}, 1, {{bucket, key, window}, 0})
      if count <= limit, do: :ok, else: {:error, :rate_limited}
    else
      :ok
    end
  end

  def enabled?, do: Application.get_env(:stabileo_utils, :rate_limit, true) == true

  def reset, do: :ets.delete_all_objects(@table)

  @impl true
  def init(nil) do
    :ets.new(@table, [:named_table, :public, :set, write_concurrency: true])
    schedule()
    {:ok, nil}
  end

  @impl true
  def handle_info(:sweep, state) do
    cutoff = System.system_time(:millisecond) - @keep_ms
    :ets.select_delete(@table, [{{{:_, :_, :"$1"}, :_}, [{:<, :"$1", cutoff}], [true]}])
    schedule()
    {:noreply, state}
  end

  defp schedule, do: Process.send_after(self(), :sweep, @sweep_every)
end
