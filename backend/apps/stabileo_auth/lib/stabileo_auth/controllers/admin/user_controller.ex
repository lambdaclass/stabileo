defmodule StabileoAuth.Controllers.Admin.UserController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoAuth.{AccountJSON, Accounts, Admin, AdminAccess, AdminAudit, Consents}

  def index(conn, params) do
    {rows, meta} = Admin.list_accounts(params)
    json(conn, %{data: rows_json(rows), meta: meta})
  end

  def show(conn, %{"id" => id}) do
    with {:ok, row} <- Admin.get_account(id) do
      json(conn, %{data: one_json(row)})
    end
  end

  def disable(conn, %{"id" => id}) do
    admin = conn.assigns.current_account

    with {:ok, account} <- fetch(id),
         {:ok, row} <- Admin.disable(admin, account) do
      AdminAudit.record(admin, "account.disable", {"account", account.id}, %{email: account.email})

      json(conn, %{data: one_json(row)})
    end
  end

  def enable(conn, %{"id" => id}) do
    with {:ok, account} <- fetch(id),
         {:ok, row} <- Admin.enable(account) do
      AdminAudit.record(
        conn.assigns.current_account,
        "account.enable",
        {"account", account.id},
        %{email: account.email}
      )

      json(conn, %{data: one_json(row)})
    end
  end

  def force_logout(conn, %{"id" => id}) do
    with {:ok, account} <- fetch(id),
         {:ok, row, revoked} <- Admin.force_logout(account) do
      AdminAudit.record(
        conn.assigns.current_account,
        "account.force_logout",
        {"account", account.id},
        %{
          email: account.email,
          revoked: revoked
        }
      )

      json(conn, %{data: one_json(row), revoked: revoked})
    end
  end

  defp fetch(id) do
    case Accounts.get_account(id) do
      nil -> {:error, :not_found}
      account -> {:ok, account}
    end
  end

  defp one_json(row), do: hd(rows_json([row]))

  # Consents and project counts in one query each for the whole page.
  defp rows_json(rows) do
    ids = Enum.map(rows, fn {account, _sessions} -> account.id end)
    consents = Consents.current_for(ids)
    projects = Admin.project_counts(ids)
    active = StabileoAuth.Sessions.last_active(ids)

    Enum.map(rows, fn {account, active_sessions} ->
      account
      |> AccountJSON.render()
      |> Map.merge(%{
        is_active: account.is_active,
        last_sign_in_at: account.last_sign_in_at,
        last_active_at: Map.get(active, account.id),
        active_sessions: active_sessions,
        is_admin: AdminAccess.admin?(account),
        consents: AccountJSON.consents_json(Map.fetch!(consents, account.id)),
        project_count: Map.get(projects, account.id, 0)
      })
    end)
  end
end
