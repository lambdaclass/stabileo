defmodule StabileoMarketing.Workers.AdsSyncDispatcher do
  @moduledoc """
  Runs every five minutes from the Oban cron and enqueues a sync for each
  saved ad account whose last one is older than the configured interval, so
  the interval changes from the admin without a deploy.
  """

  use Oban.Worker, queue: :ads, max_attempts: 1

  alias StabileoMarketing.Ads

  @impl Oban.Worker
  def perform(_job) do
    DateTime.utc_now() |> Ads.due_accounts() |> Ads.enqueue_sync()
    :ok
  end
end
