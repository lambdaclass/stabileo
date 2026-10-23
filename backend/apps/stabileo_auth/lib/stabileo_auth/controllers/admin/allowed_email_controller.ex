defmodule StabileoAuth.Controllers.Admin.AllowedEmailController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoAuth.AdminAllowedEmails

  def index(conn, params) do
    {rows, meta} = AdminAllowedEmails.list(params)
    json(conn, %{data: Enum.map(rows, &row_json/1), meta: meta})
  end

  def create(conn, params) do
    with {:ok, allowed} <- AdminAllowedEmails.allow(params["email"], conn.assigns.current_account) do
      conn
      |> put_status(:created)
      |> json(%{data: row_json(allowed)})
    end
  end

  def delete(conn, %{"id" => id}) do
    with {:ok, allowed} <- AdminAllowedEmails.get(id),
         {:ok, removed} <- AdminAllowedEmails.remove(conn.assigns.current_account, allowed) do
      json(conn, %{data: row_json(removed)})
    end
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
