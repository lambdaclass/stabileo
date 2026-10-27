defmodule StabileoInsights.FeedbackInboxTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoInsights.FeedbackInbox
  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.{AdminAction, Feedback}

  test "create keeps the sender only when given, and never takes the account from input" do
    account = Factory.insert(:account)
    other = Factory.insert(:account)

    {:ok, signed} =
      FeedbackInbox.create(
        %{"kind" => "bug", "message" => "x", "account_id" => other.id},
        account,
        %{user_agent: "ua"}
      )

    {:ok, anonymous} =
      FeedbackInbox.create(
        %{"kind" => "idea", "message" => "y", "account_id" => other.id},
        nil,
        %{}
      )

    assert Repo.get!(Feedback, signed.id).account_id == account.id
    assert Repo.get!(Feedback, signed.id).user_agent == "ua"
    assert Repo.get!(Feedback, anonymous.id).account_id == nil
  end

  test "set_status updates, records the action, and answers not_found or the failing field" do
    admin = Factory.insert(:account)
    {:ok, feedback} = FeedbackInbox.create(%{"kind" => "bug", "message" => "x"}, nil, %{})

    assert {:ok, updated} = FeedbackInbox.set_status(admin, feedback.id, "done")
    assert Repo.get!(Feedback, feedback.id).status == "done"
    assert updated.status == "done"
    assert [%{action: "feedback.status", details: %{"status" => "done"}}] = Repo.all(AdminAction)

    assert {:error, changeset} = FeedbackInbox.set_status(admin, feedback.id, "lost")
    assert %{status: ["is invalid"]} = errors_on(changeset)
    assert {:error, :not_found} = FeedbackInbox.set_status(admin, Ecto.UUID.generate(), "done")
    assert {:error, :not_found} = FeedbackInbox.set_status(admin, "nope", "done")
  end

  test "list filters by status and searches the message" do
    {:ok, _} =
      FeedbackInbox.create(
        %{"kind" => "bug", "message" => "Momento con signo invertido"},
        nil,
        %{}
      )

    {:ok, idea} =
      FeedbackInbox.create(%{"kind" => "idea", "message" => "Exportar a IFC"}, nil, %{})

    {:ok, _} = FeedbackInbox.set_status(Factory.insert(:account), idea.id, "read")

    {rows, meta} = FeedbackInbox.list(%{"status" => "new"})
    assert meta.total == 1
    assert [%{kind: "bug"}] = rows

    {rows, _} = FeedbackInbox.list(%{"search" => "ifc"})
    assert [%{kind: "idea"}] = rows
  end
end
