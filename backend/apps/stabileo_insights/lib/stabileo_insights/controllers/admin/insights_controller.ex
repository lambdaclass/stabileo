defmodule StabileoInsights.Controllers.Admin.InsightsController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoInsights.{FeedbackInbox, Summary}

  def summary(conn, params) do
    with {:ok, days} <- days(params["days"]) do
      json(conn, %{data: Summary.build(days)})
    end
  end

  def feedback(conn, params) do
    {rows, meta} = FeedbackInbox.list(params)
    json(conn, %{data: Enum.map(rows, &feedback_json/1), meta: meta})
  end

  def update_feedback(conn, %{"id" => id} = params) do
    with {:ok, feedback} <-
           FeedbackInbox.set_status(conn.assigns.current_account, id, params["status"]) do
      json(conn, %{data: feedback_json(feedback)})
    end
  end

  defp days(nil), do: {:ok, 30}

  defp days(value) do
    case Integer.parse(to_string(value)) do
      {n, ""} when n in 1..365 -> {:ok, n}
      _ -> {:error, {:validation, %{days: ["must be a whole number from 1 to 365"]}}}
    end
  end

  defp feedback_json(feedback) do
    %{
      id: feedback.id,
      kind: feedback.kind,
      message: feedback.message,
      contact_email: feedback.contact_email,
      page: feedback.page,
      app_version: feedback.app_version,
      user_agent: feedback.user_agent,
      model_link: feedback.model_link,
      status: feedback.status,
      account:
        feedback.account &&
          %{id: feedback.account.id, email: feedback.account.email, name: feedback.account.name},
      inserted_at: feedback.inserted_at,
      updated_at: feedback.updated_at
    }
  end
end
