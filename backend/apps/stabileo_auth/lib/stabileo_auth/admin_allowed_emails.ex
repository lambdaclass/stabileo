defmodule StabileoAuth.AdminAllowedEmails do
  @moduledoc """
  The admin allowlist. Only emails at the allowed domains
  (`config :stabileo_auth, :admin_domains`) can be on it.
  """

  import Ecto.Query

  alias StabileoRepo.{Listing, Repo}
  alias StabileoRepo.Schemas.{Account, AdminAllowedEmail}

  @default_domains ["lambdaclass.com", "ergodicgroup.com"]
  @sortable [:email, :inserted_at]

  def domains do
    :stabileo_auth
    |> Application.get_env(:admin_domains, @default_domains)
    |> Enum.map(&(&1 |> String.trim() |> String.downcase()))
  end

  def domain_allowed?(email) when is_binary(email) do
    case String.split(String.downcase(email), "@") do
      [_, domain] -> domain in domains()
      _ -> false
    end
  end

  def domain_allowed?(_email), do: false

  def active?(email) when is_binary(email) do
    Repo.exists?(
      from(a in AdminAllowedEmail, where: a.email == ^String.downcase(email) and a.is_active)
    )
  end

  def active?(_email), do: false

  def list(params) do
    AdminAllowedEmail
    |> filter_status(Map.get(params, "status", "active"))
    |> search(params["search"])
    |> preload(:added_by)
    |> Listing.paginate(params, @sortable, :inserted_at, default_dir: :desc)
  end

  def get(id) do
    with {:ok, uuid} <- Ecto.UUID.cast(id),
         %AdminAllowedEmail{} = allowed <- Repo.get(AdminAllowedEmail, uuid) do
      {:ok, Repo.preload(allowed, :added_by)}
    else
      _ -> {:error, :not_found}
    end
  end

  @doc "Adds `email`, or reactivates it when it was removed. `added_by` is nil for release tasks and seeds."
  def allow(email, added_by \\ nil) do
    changeset = AdminAllowedEmail.changeset(%AdminAllowedEmail{}, %{email: email}, domains())

    with {:ok, normalized} <- Ecto.Changeset.apply_action(changeset, :insert) do
      case Repo.get_by(AdminAllowedEmail, email: normalized.email) do
        %AdminAllowedEmail{is_active: true} ->
          {:error, Ecto.Changeset.add_error(changeset, :email, "is already allowed")}

        %AdminAllowedEmail{} = removed ->
          removed
          |> Ecto.Changeset.change(is_active: true, added_by_id: added_by_id(added_by))
          |> Repo.update()
          |> preloaded()

        nil ->
          changeset
          |> Ecto.Changeset.put_change(:added_by_id, added_by_id(added_by))
          |> Repo.insert()
          |> preloaded()
      end
    end
  end

  def remove(%Account{email: admin_email}, %AdminAllowedEmail{email: email})
      when admin_email == email,
      do: {:error, :cannot_remove_self}

  def remove(%Account{}, %AdminAllowedEmail{} = allowed) do
    allowed
    |> Ecto.Changeset.change(is_active: false)
    |> Repo.update()
    |> preloaded()
  end

  defp preloaded({:ok, allowed}), do: {:ok, Repo.preload(allowed, :added_by, force: true)}
  defp preloaded(error), do: error

  defp added_by_id(%Account{id: id}), do: id
  defp added_by_id(nil), do: nil

  defp filter_status(query, "active"), do: where(query, [a], a.is_active)
  defp filter_status(query, "disabled"), do: where(query, [a], not a.is_active)
  defp filter_status(query, _all), do: query

  defp search(query, term) when is_binary(term) and term != "" do
    pattern = "%" <> String.replace(String.trim(term), ~r/[\\%_]/, "\\\\\\0") <> "%"
    where(query, [a], ilike(a.email, ^pattern))
  end

  defp search(query, _term), do: query
end
