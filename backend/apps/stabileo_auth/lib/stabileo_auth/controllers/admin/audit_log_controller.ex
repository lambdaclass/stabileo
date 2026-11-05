defmodule StabileoAuth.Controllers.Admin.AuditLogController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoAuth.AdminAudit

  def index(conn, params) do
    {rows, meta} = AdminAudit.list(params)
    json(conn, %{data: Enum.map(rows, &row_json/1), meta: meta})
  end

  defp row_json(action) do
    %{
      id: action.id,
      action: action.action,
      target_type: action.target_type,
      target_id: action.target_id,
      details: action.details,
      admin: action.admin && %{id: action.admin.id, email: action.admin.email},
      inserted_at: action.inserted_at
    }
  end
end
