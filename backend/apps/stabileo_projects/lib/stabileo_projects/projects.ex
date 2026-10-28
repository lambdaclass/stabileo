defmodule StabileoProjects.Projects do
  @moduledoc """
  An account's cloud projects. Only its owner reads, writes or deletes one;
  everything answers `:cloud_projects_disabled` while the
  `cloud_projects_enabled` flag is off.
  """

  import Ecto.Query

  alias StabileoAuth.Consents
  alias StabileoProjects.Content
  alias StabileoRepo.{Features, Listing, Repo}
  alias StabileoRepo.Schemas.{Account, Project}

  @max_compressed 5_000_000
  @max_bytes 50_000_000
  @sortable [:updated_at, :inserted_at, :name, :content_bytes]
  @metadata [
    :id,
    :account_id,
    :name,
    :app_mode,
    :content_bytes,
    :node_count,
    :element_count,
    :app_version,
    :is_active,
    :inserted_at,
    :updated_at
  ]
  @input ~w(name app_mode node_count element_count app_version)

  def limits,
    do: %{
      max_projects: Features.cloud_projects_limit(),
      max_compressed_bytes: @max_compressed,
      max_bytes: @max_bytes
    }

  def list(%Account{id: account_id}, params) do
    with :ok <- enabled() do
      query =
        from(p in Project,
          where: p.account_id == ^account_id and p.is_active,
          select: struct(p, ^@metadata)
        )
        |> search(params["search"])

      {:ok, Listing.paginate(query, params, @sortable, :updated_at, default_dir: :desc)}
    end
  end

  def get(%Account{} = account, id) do
    with :ok <- enabled() do
      fetch(account, id)
    end
  end

  @doc """
  Creates a project from `name`, `app_mode`, `content` (the gzipped,
  base64-encoded document) and the optional counts. Holds an advisory lock on
  the account while it counts, so two saves at once cannot pass the limit.
  """
  def create(%Account{id: account_id}, params) do
    with :ok <- enabled(),
         {:ok, attrs} <- attrs(params, :create) do
      Repo.transaction(fn -> insert_locked(account_id, attrs) end)
    end
  end

  defp insert_locked(account_id, attrs) do
    lock_account(account_id)

    with :ok <- below_limit(account_id),
         {:ok, project} <-
           %Project{}
           |> Project.create_changeset(Map.put(attrs, :account_id, account_id))
           |> Repo.insert() do
      project
    else
      {:error, reason} -> Repo.rollback(reason)
    end
  end

  def update(%Account{} = account, id, params) do
    with :ok <- enabled(),
         {:ok, project} <- fetch(account, id),
         {:ok, attrs} <- attrs(params, :update) do
      project |> Project.update_changeset(attrs) |> Repo.update()
    end
  end

  def delete(%Account{} = account, id) do
    with :ok <- enabled(),
         {:ok, project} <- fetch(account, id) do
      project |> Ecto.Changeset.change(is_active: false) |> Repo.update()
    end
  end

  def decoded_content(%Project{content: gzip}), do: Content.encode(gzip)

  @doc "Every account's active projects, metadata only, with the owner and whether it consented to research use."
  def admin_list(params) do
    query =
      from(p in Project,
        join: a in assoc(p, :account),
        where: p.is_active,
        select: {struct(p, ^@metadata), a}
      )
      |> admin_filter(:account_id, params["account_id"])
      |> admin_filter(:app_mode, params["app_mode"])
      |> admin_filter(:search, params["search"])

    {rows, meta} = Listing.paginate(query, params, @sortable, :updated_at, default_dir: :desc)

    research =
      rows |> Enum.map(fn {_p, a} -> a.id end) |> Enum.uniq() |> Consents.research_granted()

    {Enum.map(rows, fn {p, a} -> {p, a, MapSet.member?(research, a.id)} end), meta}
  end

  defp enabled do
    if Features.cloud_projects_enabled?(), do: :ok, else: {:error, :cloud_projects_disabled}
  end

  defp fetch(%Account{id: account_id}, id) do
    with {:ok, uuid} <- uuid(id),
         %Project{is_active: true} = project <-
           Repo.get_by(Project, id: uuid, account_id: account_id) do
      {:ok, project}
    else
      _ -> {:error, :not_found}
    end
  end

  defp uuid(id) do
    case Ecto.UUID.cast(id) do
      {:ok, uuid} -> {:ok, uuid}
      :error -> {:error, :not_found}
    end
  end

  defp attrs(params, mode) do
    base = params |> Map.take(@input) |> Map.new(fn {k, v} -> {String.to_existing_atom(k), v} end)

    case {Map.fetch(params, "content"), mode} do
      {:error, :update} ->
        {:ok, base}

      {:error, :create} ->
        {:error, {:validation, %{content: ["can't be blank"]}}}

      {{:ok, encoded}, _} ->
        case Content.decode(encoded, @max_compressed, @max_bytes) do
          {:ok, gzip, bytes} ->
            {:ok, Map.merge(base, %{content: gzip, content_bytes: bytes})}

          {:error, :too_large} ->
            {:error, {:validation, %{content: ["is too large"]}}}

          {:error, :invalid} ->
            {:error, {:validation, %{content: ["must be a gzipped JSON object, base64-encoded"]}}}
        end
    end
  end

  defp lock_account(account_id) do
    Repo.query!("SELECT pg_advisory_xact_lock(hashtext($1))", ["projects:" <> account_id])
  end

  defp below_limit(account_id) do
    count =
      Repo.aggregate(
        from(p in Project, where: p.account_id == ^account_id and p.is_active),
        :count
      )

    if count < Features.cloud_projects_limit(), do: :ok, else: {:error, :project_limit_reached}
  end

  defp search(query, term) when is_binary(term) and term != "" do
    where(query, [p], ilike(p.name, ^like(term)))
  end

  defp search(query, _term), do: query

  defp admin_filter(query, _key, value) when value in [nil, ""], do: query

  defp admin_filter(query, :account_id, value) do
    case Ecto.UUID.cast(value) do
      {:ok, id} -> where(query, [p], p.account_id == ^id)
      :error -> where(query, false)
    end
  end

  defp admin_filter(query, :app_mode, value), do: where(query, [p], p.app_mode == ^value)

  defp admin_filter(query, :search, value) do
    pattern = like(value)
    where(query, [p, a], ilike(p.name, ^pattern) or ilike(a.email, ^pattern))
  end

  defp like(term), do: "%" <> String.replace(String.trim(term), ~r/[\\%_]/, "\\\\\\0") <> "%"
end
