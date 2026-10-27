defmodule StabileoRepo.Schemas.FeedbackTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.Feedback

  defp valid_attrs, do: %{kind: "bug", message: "The moment diagram flips sign"}

  test "inserts anonymously with the required fields" do
    assert {:ok, feedback} =
             %Feedback{} |> Feedback.create_changeset(valid_attrs()) |> Repo.insert()

    saved = Repo.get!(Feedback, feedback.id)
    assert saved.account_id == nil
    assert saved.status == "new"
    assert saved.message == "The moment diagram flips sign"
  end

  test "keeps the sender's account when given" do
    account = Factory.insert(:account)

    {:ok, feedback} =
      %Feedback{}
      |> Feedback.create_changeset(Map.put(valid_attrs(), :account_id, account.id))
      |> Repo.insert()

    assert Repo.get!(Feedback, feedback.id).account_id == account.id
  end

  for field <- [:kind, :message] do
    test "requires #{field}" do
      changeset =
        Feedback.create_changeset(%Feedback{}, Map.delete(valid_attrs(), unquote(field)))

      assert %{unquote(field) => ["can't be blank"]} = errors_on(changeset)
    end
  end

  test "rejects an unknown kind, a malformed contact and an overlong message" do
    changeset =
      Feedback.create_changeset(%Feedback{}, %{
        kind: "rant",
        message: String.duplicate("x", 4001),
        contact_email: "nope"
      })

    errors = errors_on(changeset)
    assert errors.kind == ["is invalid"]
    assert errors.contact_email == ["must have @ sign and no spaces"]
    assert [_] = errors.message
  end

  test "status moves only to a known status" do
    {:ok, feedback} = %Feedback{} |> Feedback.create_changeset(valid_attrs()) |> Repo.insert()

    assert %{status: ["is invalid"]} =
             errors_on(Feedback.status_changeset(feedback, %{status: "lost"}))

    assert {:ok, %{status: "done"}} =
             feedback |> Feedback.status_changeset(%{status: "done"}) |> Repo.update()
  end

  test "unknown key (user_id instead of account_id) is dropped by cast" do
    account = Factory.insert(:account)

    changeset =
      Feedback.create_changeset(%Feedback{}, Map.put(valid_attrs(), :user_id, account.id))

    assert changeset.valid?
    assert Ecto.Changeset.get_field(changeset, :account_id) == nil
  end
end
