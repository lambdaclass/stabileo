defmodule StabileoMarketing.Controllers.ActivityController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoMarketing.Activity

  @max_milestones 3

  def create(conn, params) do
    with {:ok, kinds} <- milestones(params["milestones"]),
         {:ok, recorded} <-
           Activity.record(
             conn.assigns.current_account,
             kinds,
             params["attribution"],
             params["page"],
             %{ip_address: conn.assigns[:client_ip], user_agent: conn.assigns[:user_agent]}
           ) do
      json(conn, %{data: %{recorded: recorded}})
    end
  end

  defp milestones(nil), do: {:ok, []}

  defp milestones(kinds) when is_list(kinds) and length(kinds) <= @max_milestones do
    if Enum.all?(kinds, &is_binary/1),
      do: {:ok, kinds},
      else: invalid()
  end

  defp milestones(_kinds), do: invalid()

  defp invalid, do: {:error, {:validation, %{milestones: ["must be a list of at most 3 milestone names"]}}}
end
