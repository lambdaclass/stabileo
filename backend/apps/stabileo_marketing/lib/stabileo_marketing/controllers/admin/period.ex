defmodule StabileoMarketing.Controllers.Admin.Period do
  @moduledoc "The period an admin report asks for: `from` and `to`, or the last `days` (30 when neither)."

  @max_days 366

  def range(%{"from" => from, "to" => to}, _today) do
    with {:ok, first} <- Date.from_iso8601(to_string(from)),
         {:ok, last} <- Date.from_iso8601(to_string(to)),
         true <- Date.compare(first, last) != :gt and Date.diff(last, first) < @max_days do
      {:ok, Date.range(first, last)}
    else
      _ -> invalid()
    end
  end

  def range(params, today) do
    case days(params["days"]) do
      {:ok, days} -> {:ok, Date.range(Date.add(today, -(days - 1)), today)}
      error -> error
    end
  end

  def days(nil), do: {:ok, 30}

  def days(value) do
    case Integer.parse(to_string(value)) do
      {n, ""} when n in 1..@max_days -> {:ok, n}
      _ -> invalid()
    end
  end

  defp invalid,
    do: {:error, {:validation, %{period: ["must be from and to dates, or days from 1 to 366"]}}}
end
