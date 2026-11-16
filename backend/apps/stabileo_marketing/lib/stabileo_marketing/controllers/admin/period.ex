defmodule StabileoMarketing.Controllers.Admin.Period do
  @moduledoc false

  @max_days 366

  def range(%{"from" => from, "to" => to}, _today) when is_binary(from) and is_binary(to) do
    with {:ok, first} <- Date.from_iso8601(from),
         {:ok, last} <- Date.from_iso8601(to),
         true <- Date.compare(first, last) != :gt and Date.diff(last, first) < @max_days do
      {:ok, Date.range(first, last)}
    else
      _ -> invalid()
    end
  end

  def range(%{"from" => _, "to" => _}, _today), do: invalid()

  def range(params, today) do
    case days(params["days"]) do
      {:ok, days} -> {:ok, Date.range(Date.add(today, -(days - 1)), today)}
      error -> error
    end
  end

  def days(nil), do: {:ok, 30}

  def days(value) when is_binary(value) or is_integer(value) do
    case Integer.parse(to_string(value)) do
      {n, ""} when n in 1..@max_days -> {:ok, n}
      _ -> invalid()
    end
  end

  def days(_value), do: invalid()

  defp invalid,
    do: {:error, {:validation, %{period: ["must be from and to dates, or days from 1 to 366"]}}}
end
