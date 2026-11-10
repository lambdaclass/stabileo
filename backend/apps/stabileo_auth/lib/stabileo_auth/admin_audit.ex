defmodule StabileoAuth.AdminAudit do
  @moduledoc false

  import Ecto.Query

  alias StabileoRepo.{Listing, Repo}
  alias StabileoRepo.Schemas.{Account, AdminAction}

  @doc """
  Runs `fun` and records it in one transaction, so an action is never left without its row.
  `fun` answers `{:ok, result, target, details}` or `{:error, reason}`.
  """
  def run(%Account{} = admin, action, fun) do
    Repo.transaction(fn ->
      with {:ok, result, target, details} <- fun.(),
           {:ok, _row} <- record(admin, action, target, details) do
        result
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp record(%Account{id: admin_id}, action, target, details) do
    {target_type, target_id} = target_of(target)

    %AdminAction{}
    |> AdminAction.changeset(%{
      admin_id: admin_id,
      action: action,
      target_type: target_type,
      target_id: target_id,
      details: details
    })
    |> Repo.insert()
  end

  defp target_of(nil), do: {nil, nil}
  defp target_of({type, id}), do: {type, to_string(id)}

  @doc "Newest first, with the admin's email. Filters: `action`, `admin_id`, `target_id`."
  def list(params) do
    query =
      from(a in AdminAction, preload: [:admin])
      |> filter(:action, params["action"])
      |> filter(:admin_id, params["admin_id"])
      |> filter(:target_id, params["target_id"])

    Listing.paginate(query, params, [:inserted_at, :action], :inserted_at, default_dir: :desc)
  end

  defp filter(query, _field, value) when value in [nil, ""], do: query
  defp filter(query, :action, value), do: where(query, [a], a.action == ^value)
  defp filter(query, :target_id, value), do: where(query, [a], a.target_id == ^value)

  defp filter(query, :admin_id, value) do
    case Ecto.UUID.cast(value) do
      {:ok, id} -> where(query, [a], a.admin_id == ^id)
      :error -> where(query, false)
    end
  end
end
