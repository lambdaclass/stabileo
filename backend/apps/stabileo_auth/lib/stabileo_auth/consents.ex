defmodule StabileoAuth.Consents do
  @moduledoc "Append-only: the current state of a kind is its latest row."

  import Ecto.Query

  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.{Account, Consent}

  @terms_version "2026-10-27"
  @optional ~w(usage_analytics model_research)

  @doc "`web/src/lib/legal/legal.ts` publishes the same date; a test keeps them equal."
  def terms_version, do: @terms_version

  def record(%Account{id: account_id}, kind, granted, metadata \\ %{}) do
    attrs = %{
      account_id: account_id,
      kind: kind,
      granted: granted,
      version: if(kind == "terms", do: @terms_version),
      ip_address: metadata[:ip_address],
      user_agent: metadata[:user_agent]
    }

    %Consent{} |> Consent.changeset(attrs) |> Repo.insert()
  end

  @doc "An optional consent is granted only by the boolean `true`; anything else records it refused."
  def record_sign_up(%Account{} = account, optional, metadata) do
    Repo.transaction(fn ->
      with {:ok, _} <- record(account, "terms", true, metadata),
           :ok <- record_optional(account, optional, metadata) do
        :ok
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp record_optional(account, optional, metadata) do
    Enum.reduce_while(@optional, :ok, fn kind, :ok ->
      record_step(account, kind, Map.get(optional, kind) == true, metadata)
    end)
  end

  defp record_step(account, kind, granted, metadata) do
    case record(account, kind, granted, metadata) do
      {:ok, _} -> {:cont, :ok}
      {:error, reason} -> {:halt, {:error, reason}}
    end
  end

  def current(%Account{id: id}), do: Map.get(current_for([id]), id, empty())

  def current_for([]), do: %{}

  def current_for(account_ids) do
    latest =
      from(c in Consent,
        where: c.account_id in ^account_ids,
        distinct: [c.account_id, c.kind],
        order_by: [asc: c.account_id, asc: c.kind, desc: c.inserted_at, desc: c.id]
      )
      |> Repo.all()

    Enum.reduce(latest, Map.new(account_ids, &{&1, empty()}), fn consent, acc ->
      Map.update!(acc, consent.account_id, &put_kind(&1, consent))
    end)
  end

  defp empty, do: %{terms: nil, usage_analytics: false, model_research: false}

  defp put_kind(state, %Consent{kind: "terms"} = c),
    do: %{state | terms: %{version: c.version, accepted_at: c.inserted_at}}

  defp put_kind(state, %Consent{kind: "usage_analytics", granted: g}),
    do: %{state | usage_analytics: g}

  defp put_kind(state, %Consent{kind: "model_research", granted: g}),
    do: %{state | model_research: g}

  def terms_current?(%{terms: %{version: @terms_version}}), do: true
  def terms_current?(_consents), do: false

  def research_granted(account_ids) do
    account_ids
    |> current_for()
    |> Enum.filter(fn {_id, consents} -> consents.model_research end)
    |> MapSet.new(fn {id, _} -> id end)
  end
end
