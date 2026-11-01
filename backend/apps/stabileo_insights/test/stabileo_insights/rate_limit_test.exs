defmodule StabileoInsights.RateLimitTest do
  use StabileoInsights.ConnCase, async: false

  alias StabileoInsights.Plugs.RateLimit, as: RateLimitPlug
  alias StabileoInsights.RateLimit

  defp early_in_window(window) do
    unless rem(System.monotonic_time(:millisecond), window) < 100 do
      Process.sleep(5)
      early_in_window(window)
    end
  end

  defp scope, do: {:test, System.unique_integer([:positive])}

  test "hit/3 lets `limit` hits through per window and refuses the next" do
    key = scope()
    assert RateLimit.hit(key, 2, 60_000) == :ok
    assert RateLimit.hit(key, 2, 60_000) == :ok
    assert RateLimit.hit(key, 2, 60_000) == {:error, :rate_limited}
    assert RateLimit.hit(scope(), 2, 60_000) == :ok
  end

  test "a new window starts the count again" do
    key = scope()
    window = 400
    early_in_window(window)

    assert RateLimit.hit(key, 1, window) == :ok
    assert RateLimit.hit(key, 1, window) == {:error, :rate_limited}
    Process.sleep(window)
    assert RateLimit.hit(key, 1, window) == :ok
  end

  test "the plug answers 429 with a retry-after once an address is over its limit" do
    opts = RateLimitPlug.init(scope: scope(), limit: 1)

    conn = fn ip ->
      RateLimitPlug.call(Plug.Test.conn(:post, "/") |> assign(:client_ip, ip), opts)
    end

    refute conn.("10.0.0.1").halted
    limited = conn.("10.0.0.1")
    assert limited.halted
    assert limited.status == 429
    assert get_resp_header(limited, "retry-after") == ["60"]

    assert Jason.decode!(limited.resp_body) == %{
             "error" => "rate_limited",
             "message" => "Too many requests, try again later"
           }

    refute conn.("10.0.0.2").halted
  end

  test "a signed-in account is counted by account, not by address" do
    opts = RateLimitPlug.init(scope: scope(), limit: 1)

    conn = fn id, ip ->
      Plug.Test.conn(:post, "/")
      |> assign(:client_ip, ip)
      |> assign(:current_account, %{id: id})
      |> RateLimitPlug.call(opts)
    end

    refute conn.("a", "10.0.0.3").halted
    assert conn.("a", "10.0.0.4").status == 429
    refute conn.("b", "10.0.0.3").halted
  end

  test "POST /events is limited per address" do
    ip = {10, 77, 0, rem(System.unique_integer([:positive]), 250) + 1}
    params = %{"install_id" => "5f0c2c3e-8a7b", "events" => [%{"name" => "solve"}]}

    post = fn ->
      Plug.Test.conn(:post, "/events", params)
      |> Map.put(:remote_ip, ip)
      |> put_req_header("accept", "application/json")
      |> StabileoInsights.Router.call(StabileoInsights.Router.init([]))
    end

    statuses = for _ <- 1..300, do: post.().status
    assert Enum.uniq(statuses) == [202]
    assert json_body(post.(), 429)["error"] == "rate_limited"
  end
end
