defmodule StabileoAuth.Controllers.Admin.UserController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoAuth.{AccountJSON, Accounts, Admin, AdminAccess}

  def index(conn, params) do
    {rows, meta} = Admin.list_accounts(params)
    json(conn, %{data: Enum.map(rows, &row_json/1), meta: meta})
  end

  def show(conn, %{"id" => id}) do
    with {:ok, row} <- Admin.get_account(id) do
      json(conn, %{data: row_json(row)})
    end
  end

  def disable(conn, %{"id" => id}) do
    with {:ok, account} <- fetch(id),
         {:ok, row} <- Admin.disable(conn.assigns.current_account, account) do
      json(conn, %{data: row_json(row)})
    end
  end

  def enable(conn, %{"id" => id}) do
    with {:ok, account} <- fetch(id),
         {:ok, row} <- Admin.enable(account) do
      json(conn, %{data: row_json(row)})
    end
  end

  def force_logout(conn, %{"id" => id}) do
    with {:ok, account} <- fetch(id),
         {:ok, row, revoked} <- Admin.force_logout(account) do
      json(conn, %{data: row_json(row), revoked: revoked})
    end
  end

  defp fetch(id) do
    case Accounts.get_account(id) do
      nil -> {:error, :not_found}
      account -> {:ok, account}
    end
  end

  defp row_json({account, active_sessions}) do
    account
    |> AccountJSON.render()
    |> Map.merge(%{
      is_active: account.is_active,
      last_sign_in_at: account.last_sign_in_at,
      active_sessions: active_sessions,
      is_admin: AdminAccess.admin?(account)
    })
  end
end
