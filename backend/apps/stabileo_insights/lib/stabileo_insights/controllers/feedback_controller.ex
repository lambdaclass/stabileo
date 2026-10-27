defmodule StabileoInsights.Controllers.FeedbackController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoInsights.FeedbackInbox

  def create(conn, params) do
    metadata = %{user_agent: conn.assigns[:user_agent]}

    with {:ok, feedback} <- FeedbackInbox.create(params, conn.assigns[:current_account], metadata) do
      conn
      |> put_status(:created)
      |> json(%{data: %{id: feedback.id, status: feedback.status}})
    end
  end
end
