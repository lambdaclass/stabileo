defmodule StabileoMarketing.Controllers.Admin.AcquisitionController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoMarketing.{Acquisition, Ads}
  alias StabileoMarketing.Controllers.Admin.Period

  def show(conn, params) do
    today = Ads.today()

    with {:ok, range} <- Period.range(params, today) do
      json(conn, %{data: Acquisition.report(range, today)})
    end
  end
end
