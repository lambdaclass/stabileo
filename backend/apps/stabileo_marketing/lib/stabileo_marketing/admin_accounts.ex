defmodule StabileoMarketing.AdminAccounts do
  @moduledoc false

  @behaviour StabileoAuth.AdminAccounts

  import Ecto.Query

  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.{AccountMilestone, SignupSource}

  @channels ~w(google meta search social referral email direct other)
  @source_fields ~w(channel paid placement utm_source utm_medium utm_campaign utm_content utm_term referrer landing_path trigger first_seen_at inserted_at)a

  @impl true
  def filter(query, %{"channel" => channel}) when channel in @channels do
    where(
      query,
      [a],
      a.id in subquery(from(s in SignupSource, where: s.channel == ^channel, select: s.account_id))
    )
  end

  def filter(query, %{"channel" => "unknown"}),
    do: where(query, [a], a.id not in subquery(from(s in SignupSource, select: s.account_id)))

  def filter(query, _params), do: query

  @impl true
  def extend([]), do: %{}

  def extend(account_ids) do
    sources =
      from(s in SignupSource, where: s.account_id in ^account_ids)
      |> Repo.all()
      |> Map.new(&{&1.account_id, Map.take(&1, @source_fields)})

    milestones =
      from(m in AccountMilestone,
        where: m.account_id in ^account_ids,
        select: {m.account_id, m.kind, m.occurred_at}
      )
      |> Repo.all()
      |> Enum.group_by(&elem(&1, 0), &{elem(&1, 1), elem(&1, 2)})
      |> Map.new(fn {id, kinds} -> {id, Map.new(kinds)} end)

    Map.new(account_ids, fn id ->
      {id, %{signup_source: Map.get(sources, id), milestones: Map.get(milestones, id, %{})}}
    end)
  end
end
