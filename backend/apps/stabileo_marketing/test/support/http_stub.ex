defmodule StabileoMarketing.HttpStub do
  @moduledoc """
  `StabileoMarketing.HttpClient` for tests: `stub/1` takes `{fragments, answer}`
  pairs, and a request answers with the first pair whose fragments (a string
  or a list of strings) all appear in its URL, or in the GAQL query it posts. Requests are recorded per test
  process and read back with `requests/0`.
  """

  @behaviour StabileoMarketing.HttpClient

  def stub(routes) do
    Process.put(:http_stub_routes, routes)
    Process.put(:http_stub_requests, [])
    :ok
  end

  def requests, do: Enum.reverse(Process.get(:http_stub_requests, []))

  @impl true
  def get_json(url, headers), do: answer(%{method: :get, url: url, headers: headers})

  @impl true
  def post_json(url, headers, body), do: answer(%{method: :post, url: url, headers: headers, body: body})

  @impl true
  def post_form(url, form), do: answer(%{method: :post_form, url: url, form: form})

  defp answer(request) do
    owner = Process.get(:"$callers", []) |> List.last() || self()
    routes = Process.get(:http_stub_routes) || owner_value(owner, :http_stub_routes) || []
    record(owner, request)

    text = request.url <> " " <> to_string(get_in(request, [:body, :query]) || "")

    Enum.find_value(routes, {:error, {:unstubbed, request.url}}, fn {fragments, answer} ->
      if fragments |> List.wrap() |> Enum.all?(&String.contains?(text, &1)), do: answer
    end)
  end

  defp record(owner, request) do
    if owner == self() do
      Process.put(:http_stub_requests, [request | Process.get(:http_stub_requests, [])])
    end
  end

  defp owner_value(pid, key) do
    case Process.info(pid, :dictionary) do
      {:dictionary, dict} -> Keyword.get(dict, key)
      _ -> nil
    end
  end
end
