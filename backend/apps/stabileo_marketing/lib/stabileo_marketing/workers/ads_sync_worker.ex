defmodule StabileoMarketing.Workers.AdsSyncWorker do
  @moduledoc """
  Syncs one ad account. Unique per account while a job waits or runs, so the
  dispatcher's tick and "Sync now" collapse onto one run. A rejected credential
  or request (4xx) is cancelled, since retrying cannot fix it; network and 5xx
  errors retry.
  """

  use Oban.Worker,
    queue: :ads,
    max_attempts: 3,
    unique: [keys: [:ad_account_id], states: [:available, :scheduled, :executing, :retryable], period: :infinity]

  alias StabileoMarketing.Ads.Sync
  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.AdAccount

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"ad_account_id" => id}}) do
    case Repo.get(AdAccount, id) do
      nil ->
        :ok

      account ->
        case Sync.run(account, DateTime.utc_now()) do
          {:ok, _account} -> :ok
          {:error, {:http_error, status, _message} = reason} when status in 400..499 -> {:cancel, reason}
          {:error, reason} -> {:error, reason}
        end
    end
  end
end
