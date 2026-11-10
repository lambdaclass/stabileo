defmodule StabileoMarketing.Days do
  @moduledoc "Every day in marketing is a day in Buenos Aires (UTC−3, no daylight saving): mixing in UTC dates shifts sign-ups across days."

  @offset_seconds -3 * 3600

  def today(now \\ DateTime.utc_now()), do: local_date(now)

  def local_date(%DateTime{} = at), do: at |> DateTime.add(@offset_seconds) |> DateTime.to_date()

  def utc_bounds(%Date.Range{first: first, last: last}) do
    {start_of(first), start_of(Date.add(last, 1))}
  end

  defp start_of(date), do: DateTime.new!(date, ~T[00:00:00], "Etc/UTC") |> DateTime.add(-@offset_seconds)
end
