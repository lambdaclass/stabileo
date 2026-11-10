defmodule StabileoMarketing.HttpClient.Httpc do
  @moduledoc "`StabileoMarketing.HttpClient` over Erlang's `:httpc`, with TLS peer verification."

  @behaviour StabileoMarketing.HttpClient

  @timeout 60_000

  @impl true
  def get_json(url, headers) do
    :get
    |> :httpc.request({to_charlist(url), charlist_headers(headers)}, http_opts(),
      body_format: :binary
    )
    |> handle_response()
  end

  @impl true
  def post_json(url, headers, body) do
    request =
      {to_charlist(url), charlist_headers(headers), ~c"application/json", Jason.encode!(body)}

    :post |> :httpc.request(request, http_opts(), body_format: :binary) |> handle_response()
  end

  @impl true
  def post_form(url, form) do
    request =
      {to_charlist(url), [], ~c"application/x-www-form-urlencoded", URI.encode_query(form)}

    :post |> :httpc.request(request, http_opts(), body_format: :binary) |> handle_response()
  end

  defp handle_response({:ok, {{_version, status, _reason}, _headers, body}})
       when status in 200..299 do
    case Jason.decode(body) do
      {:ok, decoded} -> {:ok, decoded}
      {:error, _} -> {:error, :invalid_response}
    end
  end

  defp handle_response({:ok, {{_version, status, _reason}, _headers, body}}),
    do: {:error, {:http_error, status, error_message(body)}}

  defp handle_response({:error, reason}), do: {:error, {:request_failed, reason}}

  defp error_message(body) do
    case Jason.decode(body) do
      {:ok, %{"error" => %{"message" => message}}} -> message
      {:ok, [%{"error" => %{"message" => message}} | _]} -> message
      _ -> String.slice(body, 0, 300)
    end
  end

  defp charlist_headers(headers),
    do: Enum.map(headers, fn {k, v} -> {to_charlist(k), to_charlist(v)} end)

  defp http_opts do
    [
      timeout: @timeout,
      connect_timeout: 10_000,
      ssl: [
        verify: :verify_peer,
        cacerts: :public_key.cacerts_get(),
        depth: 3,
        customize_hostname_check: [match_fun: :public_key.pkix_verify_hostname_match_fun(:https)]
      ]
    ]
  end
end
