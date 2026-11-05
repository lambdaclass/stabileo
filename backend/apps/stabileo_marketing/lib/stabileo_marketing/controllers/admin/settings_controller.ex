defmodule StabileoMarketing.Controllers.Admin.SettingsController do
  use StabileoUtils.Controller

  alias StabileoMarketing.Configs

  def show(conn, _params), do: json(conn, %{data: Configs.admin_view()})
end
