defmodule StabileoMarketing.Workers.MetaConversionSender do
  @moduledoc "The token is read at send time and never kept in the job's args."

  use Oban.Worker, queue: :ad_conversions, max_attempts: 5

  alias StabileoMarketing.{Configs, Conversions, HttpClient}

  @graph_api "https://graph.facebook.com/v24.0"

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"events" => events}}) do
    case Conversions.credentials() do
      {:ok, pixel_id, token} -> send_events(pixel_id, token, events)
      {:error, :not_configured} -> {:cancel, :not_configured}
    end
  end

  defp send_events(pixel_id, token, events) do
    body =
      case Configs.meta_capi_test_event_code() do
        nil -> %{data: events}
        code -> %{data: events, test_event_code: code}
      end

    "#{@graph_api}/#{pixel_id}/events"
    |> HttpClient.post_json([{"Authorization", "Bearer #{token}"}], body)
    |> handle_response()
  end

  defp handle_response({:ok, _body}), do: :ok

  defp handle_response({:error, {:http_error, status, _message} = reason})
       when status in 400..499 and status != 429,
       do: {:cancel, reason}

  defp handle_response({:error, reason}), do: {:error, reason}
end
