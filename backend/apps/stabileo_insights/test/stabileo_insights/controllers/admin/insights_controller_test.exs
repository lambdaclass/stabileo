defmodule StabileoInsights.Controllers.Admin.InsightsControllerTest do
  use StabileoInsights.ConnCase, async: false

  alias StabileoInsights.FeedbackInbox
  alias StabileoRepo.Schemas.Feedback

  setup do
    admin = Factory.insert(:admin)
    %{token: admin_log_in(admin)}
  end

  test "GET /summary answers the metrics for the window", %{token: token} do
    body = admin_request(:get, "/summary", %{"days" => "7"}, token) |> json_body(200)
    assert body["data"]["days"] == 7
    assert Enum.sort(Map.keys(body["data"])) == ~w(accounts days feedback projects since usage)
    assert body["data"]["accounts"]["total"] >= 1
    assert body["data"]["usage"]["events"] == 0
  end

  test "422 for a window out of range", %{token: token} do
    body = admin_request(:get, "/summary", %{"days" => "999"}, token) |> json_body(422)
    assert body["details"]["days"] == ["must be a whole number from 1 to 365"]
  end

  test "GET /feedback lists with the sender and PUT changes the status", %{token: token} do
    sender = Factory.insert(:account, name: "Sender")
    {:ok, fb} = FeedbackInbox.create(%{"kind" => "bug", "message" => "x"}, sender, %{})

    body = admin_request(:get, "/feedback", %{}, token) |> json_body(200)
    assert [row] = body["data"]

    assert Enum.sort(Map.keys(row)) ==
             ~w(account app_version contact_email id inserted_at kind message model_link page status updated_at user_agent)

    assert row["account"]["email"] == sender.email

    body =
      admin_request(:put, "/feedback/#{fb.id}", %{"status" => "read"}, token) |> json_body(200)

    assert body["data"]["status"] == "read"
    assert Repo.get!(Feedback, fb.id).status == "read"
  end

  test "PUT /feedback 404 and 422", %{token: token} do
    {:ok, fb} = FeedbackInbox.create(%{"kind" => "bug", "message" => "x"}, nil, %{})

    assert admin_request(:put, "/feedback/#{Ecto.UUID.generate()}", %{"status" => "read"}, token)
           |> json_body(404)
           |> Map.get("error") == "not_found"

    body =
      admin_request(:put, "/feedback/#{fb.id}", %{"status" => "lost"}, token) |> json_body(422)

    assert body["details"]["status"] == ["is invalid"]
  end

  test "401 without an admin token, and for a product token" do
    assert admin_request(:get, "/summary") |> json_body(401)
    user = Factory.insert(:account)
    assert admin_request(:get, "/feedback", %{}, log_in(user)) |> json_body(401)
  end
end
