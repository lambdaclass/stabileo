defmodule StabileoRepo.Listing do
  @moduledoc """
  Pagination and sorting for list endpoints, from string-keyed request params:
  `limit` (default 50, clamped to 1..100), `offset` (default 0, clamped to
  0..2^63-1, the int8 range), `sort_by` (one of the given sortable fields,
  else the default) and `sort_dir` (`asc` or `desc`, else `:default_dir`).
  Nulls sort last either way.

  Returns `{rows, %{total: total, limit: limit, offset: offset}}`, where
  `total` counts every row matching `query` before pagination.
  """

  import Ecto.Query

  alias StabileoRepo.Repo

  @default_limit 50
  @max_limit 100
  @max_offset 9_223_372_036_854_775_807

  def paginate(query, params, sortable_fields, default_sort, opts \\ []) do
    limit = params |> parse_int("limit", @default_limit) |> min(@max_limit) |> max(1)
    offset = params |> parse_int("offset", 0) |> min(@max_offset) |> max(0)
    sort_by = parse_sort_by(params["sort_by"], sortable_fields, default_sort)
    sort_dir = parse_sort_dir(params["sort_dir"], Keyword.get(opts, :default_dir, :asc))

    total = Repo.aggregate(query, :count)

    rows =
      query
      |> order_by([r], [{^sort_dir, field(r, ^sort_by)}, asc: r.id])
      |> limit(^limit)
      |> offset(^offset)
      |> Repo.all()

    {rows, %{total: total, limit: limit, offset: offset}}
  end

  defp parse_int(params, key, default) do
    case params[key] do
      value when is_integer(value) ->
        value

      value when is_binary(value) ->
        case Integer.parse(value) do
          {int, ""} -> int
          _ -> default
        end

      _ ->
        default
    end
  end

  defp parse_sort_by(value, sortable_fields, default) when is_binary(value) do
    Enum.find(sortable_fields, default, &(Atom.to_string(&1) == value))
  end

  defp parse_sort_by(_value, _sortable_fields, default), do: default

  defp parse_sort_dir("asc", _default), do: :asc_nulls_last
  defp parse_sort_dir("desc", _default), do: :desc_nulls_last
  defp parse_sort_dir(_value, :desc), do: :desc_nulls_last
  defp parse_sort_dir(_value, _default), do: :asc_nulls_last
end
