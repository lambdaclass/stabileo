defmodule StabileoInsights.Controllers.FeedbackControllerTest do
  use StabileoInsights.ConnCase, async: false

  alias StabileoRepo.Schemas.Feedback

  test "POST /feedback from anyone" do
    body =
      request(:post, "/feedback", %{
        "kind" => "bug",
        "message" => "Diagram flips",
        "page" => "/app/basic"
      })
      |> json_body(201)

    saved = Repo.get!(Feedback, body["data"]["id"])
    assert body["data"]["status"] == "new"
    assert saved.account_id == nil
    assert saved.user_agent == "conn-case"
    assert saved.page == "/app/basic"
  end

  test "a signed-in sender is attached; a bad token is ignored, not refused" do
    account = Factory.insert(:account)

    body =
      request(:post, "/feedback", %{"kind" => "idea", "message" => "IFC"}, log_in(account))
      |> json_body(201)

    assert Repo.get!(Feedback, body["data"]["id"]).account_id == account.id

    body =
      request(:post, "/feedback", %{"kind" => "idea", "message" => "IFC"}, "not-a-jwt")
      |> json_body(201)

    assert Repo.get!(Feedback, body["data"]["id"]).account_id == nil
  end

  test "422 with the failing fields" do
    body = request(:post, "/feedback", %{"kind" => "rant", "message" => ""}) |> json_body(422)
    assert body["error"] == "validation_error"
    assert body["details"]["kind"] == ["is invalid"]
    assert body["details"]["message"] == ["can't be blank"]
    assert Repo.aggregate(Feedback, :count) == 0
  end
end
