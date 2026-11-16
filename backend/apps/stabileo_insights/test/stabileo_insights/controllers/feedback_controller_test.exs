defmodule StabileoInsights.Controllers.FeedbackControllerTest do
  use StabileoInsights.ConnCase, async: false

  alias StabileoRepo.Schemas.Feedback

  setup do
    account = Factory.insert(:account)
    %{account: account, token: log_in(account)}
  end

  test "POST /feedback stores it with the sender", %{account: account, token: token} do
    body =
      request(
        :post,
        "/feedback",
        %{
          "kind" => "bug",
          "message" => "Diagram flips",
          "page" => "/app/basic",
          "account_id" => Ecto.UUID.generate()
        },
        token
      )
      |> json_body(201)

    saved = Repo.get!(Feedback, body["data"]["id"])
    assert body["data"]["status"] == "new"
    assert saved.account_id == account.id
    assert saved.user_agent == "conn-case"
    assert saved.page == "/app/basic"
  end

  test "422 with the failing fields", %{token: token} do
    body =
      request(:post, "/feedback", %{"kind" => "rant", "message" => ""}, token) |> json_body(422)

    assert body["error"] == "validation_error"
    assert body["details"]["kind"] == ["is invalid"]
    assert body["details"]["message"] == ["can't be blank"]
    assert Repo.aggregate(Feedback, :count) == 0
  end

  test "keeps a link to a model on Stabileo", %{token: token} do
    link = "http://localhost:4000/#data=abc"

    body =
      request(
        :post,
        "/feedback",
        %{"kind" => "bug", "message" => "x", "model_link" => link},
        token
      )
      |> json_body(201)

    assert Repo.get!(Feedback, body["data"]["id"]).model_link == link
  end

  test "422 for a model link that is not on Stabileo", %{token: token} do
    for link <- [
          "javascript:alert(document.domain)",
          "https://evil.example/#data=abc",
          "http://localhost:4000.evil.example/",
          "http://localhost:4000"
        ] do
      body =
        request(
          :post,
          "/feedback",
          %{"kind" => "bug", "message" => "x", "model_link" => link},
          token
        )
        |> json_body(422)

      assert body["details"]["model_link"] == ["must be a link to a model on Stabileo"]
    end

    assert Repo.aggregate(Feedback, :count) == 0
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

    test "429 once one address sends more than 10 a minute", %{token: token} do
      note = %{"kind" => "idea", "message" => "IFC"}
      for _ <- 1..10, do: request(:post, "/feedback", note, token) |> json_body(201)

      conn = request(:post, "/feedback", note, token)
      assert json_body(conn, 429)["error"] == "rate_limited"
      assert Repo.aggregate(StabileoRepo.Schemas.Feedback, :count) == 10
    end
  end

  test "401 without a token, and with a bad one" do
    assert request(:post, "/feedback", %{"kind" => "idea", "message" => "IFC"})
           |> json_body(401)
           |> Map.get("error") == "missing_token"

    assert request(:post, "/feedback", %{"kind" => "idea", "message" => "IFC"}, "not-a-jwt")
           |> json_body(401)

    assert Repo.aggregate(Feedback, :count) == 0
  end
end
