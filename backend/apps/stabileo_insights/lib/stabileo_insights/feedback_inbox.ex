defmodule StabileoInsights.FeedbackInbox do
  @moduledoc "Feedback sent from the app, and the admin side of reading it."

  import Ecto.Query

  alias StabileoAuth.AdminAudit
  alias StabileoRepo.{Listing, Repo}
  alias StabileoRepo.Schemas.{Account, Feedback}

  @input ~w(kind message contact_email page app_version model_link)

  def create(params, account, metadata) do
    attrs =
      params
      |> Map.take(@input)
      |> Map.put("user_agent", metadata[:user_agent])
      |> Map.put("account_id", account && account.id)

    %Feedback{} |> Feedback.create_changeset(attrs) |> Repo.insert()
  end

  def list(params) do
    query =
      from(f in Feedback, preload: [:account])
      |> filter(:status, params["status"])
      |> filter(:kind, params["kind"])
      |> filter(:search, params["search"])

    Listing.paginate(query, params, [:inserted_at, :status, :kind], :inserted_at,
      default_dir: :desc
    )
  end

  def set_status(%Account{} = admin, id, status) do
    with {:ok, uuid} <- cast(id),
         %Feedback{} = feedback <- Repo.get(Feedback, uuid),
         {:ok, updated} <-
           feedback |> Feedback.status_changeset(%{status: status}) |> Repo.update() do
      AdminAudit.record(admin, "feedback.status", {"feedback", updated.id}, %{
        status: updated.status
      })

      {:ok, Repo.preload(updated, :account)}
    else
      nil -> {:error, :not_found}
      {:error, reason} -> {:error, reason}
    end
  end

  def count_new, do: Repo.aggregate(from(f in Feedback, where: f.status == "new"), :count)

  defp cast(id) do
    case Ecto.UUID.cast(id) do
      {:ok, uuid} -> {:ok, uuid}
      :error -> {:error, :not_found}
    end
  end

  defp filter(query, _field, value) when value in [nil, ""], do: query
  defp filter(query, :status, value), do: where(query, [f], f.status == ^value)
  defp filter(query, :kind, value), do: where(query, [f], f.kind == ^value)

  defp filter(query, :search, value) do
    pattern = "%" <> String.replace(String.trim(value), ~r/[\\%_]/, "\\\\\\0") <> "%"
    where(query, [f], ilike(f.message, ^pattern) or ilike(f.contact_email, ^pattern))
  end
end
