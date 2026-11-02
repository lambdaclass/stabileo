defmodule StabileoAuth.Controllers.ProfileController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoAuth.{AccountJSON, Accounts}

  def show(conn, _params) do
    json(conn, %{data: AccountJSON.render_with_consents(conn.assigns.current_account)})
  end

  def update(conn, params) do
    with {:ok, account} <- Accounts.update_profile(conn.assigns.current_account, params) do
      json(conn, %{data: AccountJSON.render_with_consents(account)})
    end
  end
end
