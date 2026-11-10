defmodule StabileoRepo.Schemas.AssignmentTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.Assignment

  @opens ~U[2026-11-12 13:00:00Z]

  defp valid_attrs(account) do
    %{
      account_id: account.id,
      code: "K7Q2M9XWPA",
      title: "TP 3: vigas",
      exercise: %{"id" => "beam-1", "params" => %{"L" => [2, 6]}},
      duration_minutes: 90,
      opens_at: @opens,
      reveal: "on_submit"
    }
  end

  defp insert(attrs), do: %Assignment{} |> Assignment.create_changeset(attrs) |> Repo.insert()

  test "inserts with the required fields and keeps the exercise as sent" do
    account = Factory.insert(:account)

    assert {:ok, assignment} =
             insert(Map.put(valid_attrs(account), :closes_at, ~U[2026-11-12 16:00:00Z]))

    saved = Repo.get!(Assignment, assignment.id)
    assert saved.account_id == account.id
    assert saved.code == "K7Q2M9XWPA"
    assert saved.title == "TP 3: vigas"
    assert saved.exercise == %{"id" => "beam-1", "params" => %{"L" => [2, 6]}}
    assert saved.duration_minutes == 90
    assert saved.opens_at == @opens
    assert saved.closes_at == ~U[2026-11-12 16:00:00Z]
    assert saved.reveal == "on_submit"
  end

  for field <- [:account_id, :code, :title, :exercise, :duration_minutes, :opens_at, :reveal] do
    test "requires #{field}" do
      account = Factory.insert(:account)

      changeset =
        Assignment.create_changeset(
          %Assignment{},
          Map.delete(valid_attrs(account), unquote(field))
        )

      assert %{unquote(field) => ["can't be blank"]} = errors_on(changeset)
    end
  end

  test "trims the title and bounds it to 120 characters" do
    account = Factory.insert(:account)

    blank = Assignment.create_changeset(%Assignment{}, %{valid_attrs(account) | title: "   "})
    assert %{title: ["can't be blank"]} = errors_on(blank)

    long =
      Assignment.create_changeset(%Assignment{}, %{
        valid_attrs(account)
        | title: String.duplicate("a", 121)
      })

    assert %{title: ["should be at most 120 character(s)"]} = errors_on(long)

    ok = Assignment.create_changeset(%Assignment{}, %{valid_attrs(account) | title: "  TP 3  "})
    assert get_change(ok, :title) == "TP 3"
  end

  test "duration is 1 to 600 minutes" do
    account = Factory.insert(:account)

    for minutes <- [0, 601] do
      changeset =
        Assignment.create_changeset(%Assignment{}, %{
          valid_attrs(account)
          | duration_minutes: minutes
        })

      assert %{duration_minutes: [_]} = errors_on(changeset)
    end

    assert Assignment.create_changeset(%Assignment{}, %{
             valid_attrs(account)
             | duration_minutes: 600
           }).valid?
  end

  test "reveal is on_submit or after_close, and after_close needs closes_at" do
    account = Factory.insert(:account)

    unknown =
      Assignment.create_changeset(%Assignment{}, %{valid_attrs(account) | reveal: "never"})

    assert %{reveal: ["is invalid"]} = errors_on(unknown)

    no_close =
      Assignment.create_changeset(%Assignment{}, %{valid_attrs(account) | reveal: "after_close"})

    assert %{closes_at: ["is required when results show after closing"]} = errors_on(no_close)
  end

  test "closes_at must come after opens_at" do
    account = Factory.insert(:account)

    changeset =
      Assignment.create_changeset(
        %Assignment{},
        Map.put(valid_attrs(account), :closes_at, @opens)
      )

    assert %{closes_at: ["must be after opens_at"]} = errors_on(changeset)
  end

  test "the exercise must be a JSON object of at most 256 KiB" do
    account = Factory.insert(:account)

    list = Assignment.create_changeset(%Assignment{}, %{valid_attrs(account) | exercise: [1, 2]})
    assert %{exercise: ["is invalid"]} = errors_on(list)

    big = %{"blob" => String.duplicate("x", Assignment.max_exercise_bytes())}

    too_large =
      Assignment.create_changeset(%Assignment{}, %{valid_attrs(account) | exercise: big})

    assert %{exercise: ["is too large"]} = errors_on(too_large)
  end

  test "the code is ten characters of the share alphabet and unique" do
    account = Factory.insert(:account)

    for bad <- ["K7Q2M9XWP", "K7Q2M9XWP0", "k7q2m9xwpa"] do
      changeset = Assignment.create_changeset(%Assignment{}, %{valid_attrs(account) | code: bad})
      assert %{code: ["has invalid format"]} = errors_on(changeset)
    end

    assert {:ok, _} = insert(valid_attrs(account))
    assert {:error, changeset} = insert(valid_attrs(Factory.insert(:account)))
    assert %{code: ["has already been taken"]} = errors_on(changeset)
  end

  test "update never changes the owner or the code" do
    account = Factory.insert(:account)
    {:ok, assignment} = insert(valid_attrs(account))

    changeset =
      Assignment.update_changeset(assignment, %{
        account_id: Factory.insert(:account).id,
        code: "ZZZZZZZZZZ",
        title: "Renamed"
      })

    {:ok, updated} = Repo.update(changeset)
    assert updated.account_id == account.id
    assert updated.code == "K7Q2M9XWPA"
    assert updated.title == "Renamed"
  end

  test "unknown key (user_id instead of account_id) is dropped by cast" do
    account = Factory.insert(:account)
    attrs = account |> valid_attrs() |> Map.delete(:account_id) |> Map.put(:user_id, account.id)
    changeset = Assignment.create_changeset(%Assignment{}, attrs)
    refute changeset.valid?
    assert %{account_id: ["can't be blank"]} = errors_on(changeset)
  end

  test "deleting the owner's account deletes the assignment" do
    account = Factory.insert(:account)
    {:ok, assignment} = insert(valid_attrs(account))
    Repo.delete!(account)
    assert Repo.get(Assignment, assignment.id) == nil
  end
end
