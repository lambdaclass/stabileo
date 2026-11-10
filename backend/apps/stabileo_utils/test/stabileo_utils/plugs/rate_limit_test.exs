defmodule StabileoUtils.Plugs.RateLimitTest do
  use ExUnit.Case, async: false

  import Plug.Test

  alias StabileoUtils.Plugs.RateLimit

  setup do
    Application.put_env(:stabileo_utils, :rate_limit, true)
    StabileoUtils.RateLimit.reset()

    on_exit(fn ->
      Application.put_env(:stabileo_utils, :rate_limit, false)
      StabileoUtils.RateLimit.reset()
    end)
  end

  defp call(opts, assigns) do
    conn = Enum.reduce(assigns, conn(:get, "/"), fn {k, v}, c -> Plug.Conn.assign(c, k, v) end)
    RateLimit.call(conn, RateLimit.init(opts))
  end

  test "key: :account counts each account apart, whatever the address" do
    opts = [bucket: :test_accounts, limit: 2, period_ms: 60_000, key: :account]
    ada = [client_ip: "10.0.0.1", current_account: %{id: "ada"}]
    bob = [client_ip: "10.0.0.1", current_account: %{id: "bob"}]

    refute call(opts, ada).halted
    refute call(opts, ada).halted

    limited = call(opts, ada)
    assert limited.halted
    assert limited.status == 429
    assert Jason.decode!(limited.resp_body)["error"] == "rate_limited"
    assert Plug.Conn.get_resp_header(limited, "retry-after") == ["60"]

    refute call(opts, bob).halted
  end

  test "by default it counts by address" do
    opts = [bucket: :test_addresses, limit: 1, period_ms: 60_000]

    refute call(opts, client_ip: "10.0.0.1", current_account: %{id: "ada"}).halted
    assert call(opts, client_ip: "10.0.0.1", current_account: %{id: "bob"}).status == 429
    refute call(opts, client_ip: "10.0.0.2", current_account: %{id: "ada"}).halted
  end
end
