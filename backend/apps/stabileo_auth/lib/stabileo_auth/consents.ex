defmodule StabileoAuth.Consents do
  @moduledoc """
  What an account agreed to: the terms of use and privacy policy (by version),
  sharing anonymous usage and letting its saved projects be used, anonymised,
  to improve Stabileo. Each decision is a new `consents` row; the current
  state of a kind is its latest row.
  """

  import Ecto.Query

  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.{Account, Consent}

  @terms_version "2026-10-27"
  @optional ~w(usage_analytics model_research)

  @doc """
  The version of the terms of use and privacy policy in force. The app
  publishes the same date on both documents; when they change, both move and
  every account is asked to accept again.
  """
  def terms_version, do: @terms_version

  @doc "Records one decision. `terms` always records the version in force."
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

  @doc """
  Accepts the terms and records any optional consents given at sign-up, as
  one step: a failure leaves none of them recorded.
  """
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
    @optional
    |> Enum.filter(&is_boolean(Map.get(optional, &1)))
    |> Enum.reduce_while(:ok, fn kind, :ok ->
      record_step(account, kind, optional[kind], metadata)
    end)
  end

  defp record_step(account, kind, granted, metadata) do
    case record(account, kind, granted, metadata) do
      {:ok, _} -> {:cont, :ok}
      {:error, reason} -> {:halt, {:error, reason}}
    end
  end

  @doc "The current consents of one account."
  def current(%Account{id: id}), do: Map.get(current_for([id]), id, empty())

  @doc "The current consents of many accounts at once, keyed by account id."
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

  @doc "Whether the account accepted the terms in force."
  def terms_current?(%{terms: %{version: @terms_version}}), do: true
  def terms_current?(_consents), do: false

  @doc "Account ids, among `account_ids`, whose current `model_research` consent is granted."
  def research_granted(account_ids) do
    account_ids
    |> current_for()
    |> Enum.filter(fn {_id, consents} -> consents.model_research end)
    |> MapSet.new(fn {id, _} -> id end)
  end
end
