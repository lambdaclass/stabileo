defmodule StabileoMarketing.Controllers.TrackingController do
  use StabileoUtils.Controller

  alias StabileoMarketing.Configs

  def show(conn, _params) do
    conn
    |> put_resp_header("cache-control", "public, max-age=300")
    |> json(%{data: Configs.public()})
  end
end
