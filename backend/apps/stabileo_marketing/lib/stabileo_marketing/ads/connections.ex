defmodule StabileoMarketing.Ads.Connections do
  @moduledoc """
  The live state of each saved ad account's connection, checked against its
  API now, step by step, so an admin sees which credential or call fails.
  Accounts are checked concurrently; one that does not answer within 20 s is
  reported as such rather than holding the rest.
  """

  alias StabileoMarketing.Ads
  alias StabileoMarketing.Ads.{Source, Sync}

  @timeout_ms 20_000

  def check do
    accounts = Ads.accounts()

    accounts
    |> Task.async_stream(&steps/1, timeout: @timeout_ms, on_timeout: :kill_task, ordered: true)
    |> Enum.zip(accounts)
    |> Enum.map(fn
      {{:ok, steps}, account} -> report(account, steps)
      {{:exit, :timeout}, account} -> report(account, [Source.step("request", :error, "No answer in 20 s")])
      {{:exit, reason}, account} -> report(account, [Source.step("request", :error, inspect(reason))])
    end)
  end

  defp steps(account) do
    Sync.source(account).check(account)
  rescue
    error -> [Source.step("request", :error, Exception.message(error))]
  end

  defp report(account, steps) do
    account
    |> Ads.account_json()
    |> Map.merge(%{ok: Enum.all?(steps, &(&1.status == :ok)), steps: steps})
  end
end
