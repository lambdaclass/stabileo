defmodule StabileoInsights.Usage do
  @moduledoc """
  Anonymous usage events, sent in batches by browsers whose user chose to
  share usage. A batch is checked event by event: a malformed event is
  dropped and counted, never stored, and never fails the rest of the batch.
  While `usage_telemetry_enabled` is off nothing is stored.
  """

  import Ecto.Query

  alias StabileoRepo.{Features, Repo}
  alias StabileoRepo.Schemas.UsageEvent

  @max_events 100
  @max_props 20
  @max_string 120
  @prop_key ~r/^[a-z][a-z0-9_]{0,31}$/
  @past_window 7 * 24 * 3600
  @future_window 300

  def ingest(%{"install_id" => _, "events" => events} = batch) when is_list(events) do
    cond do
      events == [] or length(events) > @max_events ->
        {:error, {:validation, %{events: ["must hold between 1 and #{@max_events} events"]}}}

      not Features.usage_telemetry_enabled?() ->
        {:ok, %{accepted: 0, rejected: 0, enabled: false}}

      true ->
        store(batch, events)
    end
  end

  def ingest(_batch),
    do: {:error, {:validation, %{events: ["can't be blank"], install_id: ["can't be blank"]}}}

  defp store(batch, events) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)
    shared = Map.take(batch, ~w(install_id session_id app_version app_mode locale))

    {rows, rejected} =
      Enum.reduce(events, {[], 0}, fn event, {rows, rejected} ->
        case row(shared, event, now) do
          {:ok, row} -> {[row | rows], rejected}
          :error -> {rows, rejected + 1}
        end
      end)

    {count, _} = Repo.insert_all(UsageEvent, rows)
    {:ok, %{accepted: count, rejected: rejected, enabled: true}}
  end

  defp row(shared, %{"name" => _} = event, now) do
    with {:ok, props} <- props(Map.get(event, "props", %{})),
         {:ok, at} <- occurred_at(event["at"], now) do
      changeset =
        UsageEvent.changeset(
          %UsageEvent{},
          Map.merge(shared, %{"name" => event["name"], "props" => props, "occurred_at" => at})
        )

      if changeset.valid? do
        {:ok,
         changeset
         |> Ecto.Changeset.apply_changes()
         |> Map.take(fields())
         |> Map.merge(%{id: Ecto.UUID.generate(), inserted_at: now})}
      else
        :error
      end
    else
      _ -> :error
    end
  end

  defp row(_shared, _event, _now), do: :error

  defp fields,
    do: [:install_id, :session_id, :name, :props, :app_version, :app_mode, :locale, :occurred_at]

  defp props(props) when is_map(props) and map_size(props) <= @max_props do
    if Enum.all?(props, &valid_prop?/1), do: {:ok, props}, else: :error
  end

  defp props(_props), do: :error

  defp valid_prop?({key, value}) when is_binary(key) do
    Regex.match?(@prop_key, key) and valid_value?(value)
  end

  defp valid_value?(value) when is_binary(value), do: String.length(value) <= @max_string
  defp valid_value?(value), do: is_number(value) or is_boolean(value)

  defp occurred_at(nil, now), do: {:ok, now}

  defp occurred_at(value, now) when is_binary(value) do
    with {:ok, at, _offset} <- DateTime.from_iso8601(value),
         diff = DateTime.diff(at, now),
         true <- diff >= -@past_window and diff <= @future_window do
      {:ok, DateTime.truncate(at, :second)}
    else
      _ -> :error
    end
  end

  defp occurred_at(_value, _now), do: :error

  @doc "Deletes events older than `days` days. Returns how many."
  def prune(days \\ 395) do
    cutoff = DateTime.utc_now() |> DateTime.add(-days * 86_400)
    {count, _} = Repo.delete_all(from(e in UsageEvent, where: e.occurred_at < ^cutoff))
    count
  end
end
