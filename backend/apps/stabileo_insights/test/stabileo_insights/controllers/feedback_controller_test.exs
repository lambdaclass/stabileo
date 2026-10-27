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

  test "401 without a token, and with a bad one" do
    assert request(:post, "/feedback", %{"kind" => "idea", "message" => "IFC"})
           |> json_body(401)
           |> Map.get("error") == "missing_token"

    assert request(:post, "/feedback", %{"kind" => "idea", "message" => "IFC"}, "not-a-jwt")
           |> json_body(401)

    assert Repo.aggregate(Feedback, :count) == 0
  end
end
