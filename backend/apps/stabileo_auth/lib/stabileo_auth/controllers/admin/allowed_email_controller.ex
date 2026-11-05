defmodule StabileoAuth.Controllers.Admin.AllowedEmailController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoAuth.{AdminAllowedEmails, AdminAudit}

  def index(conn, params) do
    {rows, meta} = AdminAllowedEmails.list(params)
    json(conn, %{data: Enum.map(rows, &row_json/1), meta: meta})
  end

  def create(conn, params) do
    admin = conn.assigns.current_account

    with {:ok, allowed} <-
           AdminAudit.run(admin, "allowlist.add", fn -> allow(params["email"], admin) end) do
      conn
      |> put_status(:created)
      |> json(%{data: row_json(allowed)})
    end
  end

  def delete(conn, %{"id" => id}) do
    admin = conn.assigns.current_account

    with {:ok, allowed} <- AdminAllowedEmails.get(id),
         {:ok, removed} <-
           AdminAudit.run(admin, "allowlist.remove", fn -> remove(admin, allowed) end) do
      json(conn, %{data: row_json(removed)})
    end
  end

  defp allow(email, admin) do
    with {:ok, allowed} <- AdminAllowedEmails.allow(email, admin),
         do: {:ok, allowed, {"allowed_email", allowed.id}, %{email: allowed.email}}
  end

  defp remove(admin, allowed) do
    with {:ok, removed} <- AdminAllowedEmails.remove(admin, allowed),
         do: {:ok, removed, {"allowed_email", removed.id}, %{email: removed.email}}
  end

  defp row_json(allowed) do
    %{
      id: allowed.id,
      email: allowed.email,
      is_active: allowed.is_active,
      added_by: allowed.added_by && %{id: allowed.added_by.id, email: allowed.added_by.email},
      inserted_at: allowed.inserted_at,
      updated_at: allowed.updated_at
    }
  end
end
