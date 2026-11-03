defmodule StabileoMarketing.FakeSource do
  @moduledoc "An ads source for tests: answers the snapshot `put/1` stored for the test process."

  @behaviour StabileoMarketing.Ads.Source

  def put(answer), do: :persistent_term.put(__MODULE__, answer)

  @impl true
  def fetch(_account, _range, _today), do: :persistent_term.get(__MODULE__, {:error, :not_connected})

  @impl true
  def check(_account), do: [StabileoMarketing.Ads.Source.step("credentials", :ok)]
end
