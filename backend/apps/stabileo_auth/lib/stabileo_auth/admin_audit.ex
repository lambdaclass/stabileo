defmodule StabileoAuth.AdminAudit do
  @moduledoc """
  The record of what admins did on the admin site. Every admin action that
  changes something writes one row; the admin site lists them.
  """

  import Ecto.Query

  require Logger

  alias StabileoRepo.{Listing, Repo}
  alias StabileoRepo.Schemas.{Account, AdminAction}

  @doc """
  Records an action. Never fails the action it records: a write error is
  logged and swallowed, so an audit hiccup cannot block disabling an account.
  """
  def record(%Account{id: admin_id}, action, target \\ nil, details \\ %{}) do
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
    |> case do
      {:ok, row} ->
        {:ok, row}

      {:error, changeset} ->
        Logger.error("admin audit write failed: #{inspect(changeset.errors)}")
        {:error, changeset}
    end
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
