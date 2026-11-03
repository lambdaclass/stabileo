defmodule StabileoMarketing.Activity do
  @moduledoc """
  What an account does after signing up, for activation and return rates:
  the first time it reaches each milestone (`AccountMilestone`) and the days
  it used the app (`AccountActiveDay`). The first saved project is a
  conversion too, sent to Meta as `FirstSave`.
  """

  alias StabileoMarketing.Conversions
  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.{Account, AccountActiveDay, AccountMilestone}

  @doc """
  Records today as an active day and each milestone in `kinds` the account
  had not reached. Answers the milestones newly recorded, so the browser sends
  the pixel's `FirstSave` only once.
  """
  def record(%Account{} = account, kinds, attribution, page, metadata) do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    Repo.insert_all(
      AccountActiveDay,
      [%{id: Ecto.UUID.generate(), account_id: account.id, day: DateTime.to_date(now)}],
      on_conflict: :nothing,
      conflict_target: [:account_id, :day]
    )

    recorded =
      kinds
      |> List.wrap()
      |> Enum.filter(&(&1 in AccountMilestone.kinds()))
      |> Enum.uniq()
      |> Enum.filter(&new_milestone?(account, &1, now))

    if "first_save" in recorded,
      do: Conversions.enqueue_first_save(account, attribution, page, metadata)

    {:ok, recorded}
  end

  defp new_milestone?(account, kind, now) do
    row = %{id: Ecto.UUID.generate(), account_id: account.id, kind: kind, occurred_at: now, inserted_at: now}

    case Repo.insert_all(AccountMilestone, [row], on_conflict: :nothing, conflict_target: [:account_id, :kind]) do
      {1, _} -> true
      {0, _} -> false
    end
  end
end
