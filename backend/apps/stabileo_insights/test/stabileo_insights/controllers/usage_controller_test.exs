defmodule StabileoInsights.Controllers.UsageControllerTest do
  use StabileoInsights.ConnCase, async: false

  alias StabileoRepo.Schemas.UsageEvent

  test "POST /events answers 202 with what was kept, with no account needed" do
    {:ok, _} = StabileoRepo.Features.set_usage_telemetry_enabled(true)

    body =
      request(:post, "/events", %{
        "install_id" => "5f0c2c3e-8a7b-4b8e-9f6e",
        "events" => [%{"name" => "solve", "props" => %{"outcome" => "ok"}}, %{"name" => "BAD"}]
      })
      |> json_body(202)

    assert body == %{"accepted" => 1, "rejected" => 1, "enabled" => true}
    assert [%{name: "solve"}] = Repo.all(UsageEvent)
  end

  describe "rate limit" do
    setup do
      Application.put_env(:stabileo_utils, :rate_limit, true)
      StabileoUtils.RateLimit.reset()

      on_exit(fn ->
        Application.put_env(:stabileo_utils, :rate_limit, false)
        StabileoUtils.RateLimit.reset()
      end)
    end

    test "429 once one address sends more than 30 batches a minute" do
      {:ok, _} = StabileoRepo.Features.set_usage_telemetry_enabled(true)
      batch = %{"install_id" => "5f0c2c3e-8a7b", "events" => [%{"name" => "solve"}]}

      for _ <- 1..30, do: request(:post, "/events", batch) |> json_body(202)

      conn = request(:post, "/events", batch)
      assert json_body(conn, 429)["error"] == "rate_limited"
      assert Plug.Conn.get_resp_header(conn, "retry-after") == ["60"]
      assert Repo.aggregate(UsageEvent, :count) == 30
    end
  end

  test "202 enabled: false while switched off" do
    body =
      request(:post, "/events", %{
        "install_id" => "5f0c2c3e-8a7b",
        "events" => [%{"name" => "solve"}]
      })
      |> json_body(202)

    assert body["enabled"] == false
    assert Repo.aggregate(UsageEvent, :count) == 0
  end

  test "202 enabled: false while switched off, even for a batch it would refuse" do
    body =
      request(:post, "/events", %{"install_id" => "5f0c2c3e-8a7b", "events" => []})
      |> json_body(202)

    assert body == %{"accepted" => 0, "rejected" => 0, "enabled" => false}
  end

  test "422 with the failing field" do
    {:ok, _} = StabileoRepo.Features.set_usage_telemetry_enabled(true)

    body =
      request(:post, "/events", %{"install_id" => "5f0c2c3e-8a7b", "events" => []})
      |> json_body(422)

    assert body["error"] == "validation_error"
    assert [_] = body["details"]["events"]
  end
end
