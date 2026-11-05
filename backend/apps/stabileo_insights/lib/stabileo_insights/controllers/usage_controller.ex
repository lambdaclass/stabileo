defmodule StabileoInsights.Controllers.UsageController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoInsights.Usage

  def create(conn, params) do
    with {:ok, result} <- Usage.ingest(params) do
      conn
      |> put_status(:accepted)
      |> json(result)
    end
  end
end
