defmodule StabileoAssignments.AssignmentsTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoAssignments.{Assignments, Exams}
  alias StabileoRepo.{Factory, Features}
  alias StabileoRepo.Schemas.{Assignment, AssignmentAttempt}

  @now ~U[2026-11-12 12:00:00Z]

  setup do
    {:ok, _} = Features.set_assignments_enabled(true)
    %{owner: Factory.insert(:account, name: "Prof. Pérez")}
  end

  defp params(overrides \\ %{}) do
    Map.merge(
      %{
        "title" => "TP 3: vigas",
        "exercise" => %{"id" => "beam-1", "params" => %{"L" => [2, 6]}},
        "duration_minutes" => 90,
        "reveal" => "on_submit"
      },
      overrides
    )
  end

  defp create!(owner, overrides \\ %{}) do
    {:ok, {assignment, _}} = Assignments.create(owner, params(overrides), @now)
    assignment
  end

  describe "create" do
    test "owner from the session, a generated code, opens now when not given", %{owner: owner} do
      assert {:ok, {assignment, counts}} =
               Assignments.create(
                 owner,
                 params(%{"account_id" => Ecto.UUID.generate(), "code" => "AAAAAAAAAA"}),
                 @now
               )

      assert counts == %{attempts: 0, submitted: 0}
      saved = Repo.get!(Assignment, assignment.id)
      assert saved.account_id == owner.id
      assert saved.code =~ ~r/^[2-9A-HJ-NP-Z]{10}$/
      refute saved.code == "AAAAAAAAAA"
      assert saved.opens_at == @now
      assert saved.closes_at == nil
      assert saved.exercise == %{"id" => "beam-1", "params" => %{"L" => [2, 6]}}
      assert saved.title == "TP 3: vigas"
    end

    test "an explicit null opens_at opens now", %{owner: owner} do
      assert {:ok, {assignment, _}} =
               Assignments.create(owner, params(%{"opens_at" => nil}), @now)

      assert Repo.get!(Assignment, assignment.id).opens_at == @now
    end

    test "a code taken between the check and the insert is drawn again", %{owner: owner} do
      taken = create!(owner).code
      {:ok, draws} = Agent.start_link(fn -> [taken, "ZZZZZZZZZZ"] end)
      next = fn -> Agent.get_and_update(draws, fn [c | rest] -> {c, rest} end) end

      assert {:ok, {assignment, _}} = Assignments.create(owner, params(), @now, next)
      assert Repo.get!(Assignment, assignment.id).code == "ZZZZZZZZZZ"
    end

    test "codes differ between assignments", %{owner: owner} do
      codes = for _ <- 1..20, do: create!(owner).code
      assert length(Enum.uniq(codes)) == 20
    end

    test "takes the window as ISO 8601", %{owner: owner} do
      assignment =
        create!(owner, %{
          "opens_at" => "2026-11-12T13:00:00Z",
          "closes_at" => "2026-11-12T16:00:00Z",
          "reveal" => "after_close"
        })

      assert assignment.opens_at == ~U[2026-11-12 13:00:00Z]
      assert assignment.closes_at == ~U[2026-11-12 16:00:00Z]
      assert assignment.reveal == "after_close"
    end

    test "422 on the failing field, nothing written", %{owner: owner} do
      assert {:error, changeset} =
               Assignments.create(
                 owner,
                 params(%{"exercise" => "beam", "duration_minutes" => 0}),
                 @now
               )

      assert %{exercise: ["is invalid"], duration_minutes: [_]} = errors_on(changeset)
      assert Repo.aggregate(Assignment, :count) == 0
    end

    test "at most 100 per account", %{owner: owner} do
      Repo.insert_all(
        Assignment,
        for i <- 1..100 do
          %{
            id: Ecto.UUID.generate(),
            account_id: owner.id,
            title: "T#{i}",
            exercise: %{},
            duration_minutes: 10,
            opens_at: @now,
            reveal: "on_submit",
            code: "TEST" <> String.pad_leading(Integer.to_string(i), 6, "0"),
            inserted_at: @now,
            updated_at: @now
          }
        end
      )

      assert {:error, :assignment_limit_reached} = Assignments.create(owner, params(), @now)
      assert Repo.aggregate(Assignment, :count) == 100
      assert {:ok, _} = Assignments.create(Factory.insert(:account), params(), @now)
    end

    test "flag off", %{owner: owner} do
      {:ok, _} = Features.set_assignments_enabled(false)
      assert {:error, :assignments_disabled} = Assignments.create(owner, params(), @now)
      assert Repo.aggregate(Assignment, :count) == 0
    end
  end

  describe "list and get" do
    test "only the caller's, newest first, with attempt counts", %{owner: owner} do
      first = create!(owner, %{"title" => "Primero"})
      second = create!(owner, %{"title" => "Segundo"})

      Repo.update_all(from(a in Assignment, where: a.id == ^first.id),
        set: [inserted_at: ~U[2026-11-01 00:00:00Z]]
      )

      create!(Factory.insert(:account))

      student = Factory.insert(:account)
      {:ok, {attempt, _}} = Exams.start(student, second.code, @now)
      {:ok, _} = Exams.submit(student, attempt.id, %{"client_score" => 1}, @now)
      {:ok, _} = Exams.start(Factory.insert(:account), second.code, @now)

      assert {:ok, {rows, meta}} = Assignments.list(owner, %{})
      assert meta.total == 2

      assert [
               {%{id: id2}, %{attempts: 2, submitted: 1}},
               {%{id: id1}, %{attempts: 0, submitted: 0}}
             ] =
               rows

      assert {id2, id1} == {second.id, first.id}

      assert {:ok, {[{%{title: "Primero"}, _}], %{total: 1}}} =
               Assignments.list(owner, %{"search" => "prim"})
    end

    test "another account's assignment is not found", %{owner: owner} do
      assignment = create!(owner)
      other = Factory.insert(:account)
      assert {:error, :not_found} = Assignments.get(other, assignment.id)
      assert {:error, :not_found} = Assignments.get(owner, "not-a-uuid")
      assert {:ok, {%{id: id, exercise: exercise}, _}} = Assignments.get(owner, assignment.id)
      assert id == assignment.id
      assert exercise["id"] == "beam-1"
    end
  end

  describe "update" do
    test "changes title, window and reveal; never the owner or the code", %{owner: owner} do
      assignment = create!(owner)

      assert {:ok, {updated, _}} =
               Assignments.update(owner, assignment.id, %{
                 "title" => "TP 3 (recuperatorio)",
                 "closes_at" => "2026-11-20T12:00:00Z",
                 "reveal" => "after_close",
                 "code" => "ZZZZZZZZZZ",
                 "account_id" => Factory.insert(:account).id
               })

      saved = Repo.get!(Assignment, updated.id)
      assert saved.title == "TP 3 (recuperatorio)"
      assert saved.closes_at == ~U[2026-11-20 12:00:00Z]
      assert saved.reveal == "after_close"
      assert saved.code == assignment.code
      assert saved.account_id == owner.id
    end

    test "the exercise changes until someone starts, then 409 assignment_started", %{owner: owner} do
      assignment = create!(owner)

      assert {:ok, {%{exercise: %{"id" => "beam-2"}}, _}} =
               Assignments.update(owner, assignment.id, %{"exercise" => %{"id" => "beam-2"}})

      {:ok, _} = Exams.start(Factory.insert(:account), assignment.code, @now)

      assert {:error, :assignment_started} =
               Assignments.update(owner, assignment.id, %{"exercise" => %{"id" => "beam-3"}})

      assert Repo.get!(Assignment, assignment.id).exercise == %{"id" => "beam-2"}

      assert {:ok, {%{title: "Renamed"}, %{attempts: 1}}} =
               Assignments.update(owner, assignment.id, %{
                 "title" => "Renamed",
                 "exercise" => %{"id" => "beam-2"}
               })
    end

    test "422 with the field; other account 404", %{owner: owner} do
      assignment = create!(owner)

      assert {:error, changeset} =
               Assignments.update(owner, assignment.id, %{"closes_at" => "2026-11-01T00:00:00Z"})

      assert %{closes_at: ["must be after opens_at"]} = errors_on(changeset)

      assert {:error, :not_found} =
               Assignments.update(Factory.insert(:account), assignment.id, %{"title" => "X"})

      assert Repo.get!(Assignment, assignment.id).title == "TP 3: vigas"
    end
  end

  describe "delete" do
    test "removes the assignment and its attempts", %{owner: owner} do
      assignment = create!(owner)
      {:ok, {attempt, _}} = Exams.start(Factory.insert(:account), assignment.code, @now)

      assert {:error, :not_found} = Assignments.delete(Factory.insert(:account), assignment.id)
      assert Repo.get(Assignment, assignment.id)

      assert {:ok, {deleted, %{attempts: 1}}} = Assignments.delete(owner, assignment.id)
      assert deleted.id == assignment.id
      assert Repo.get(Assignment, assignment.id) == nil
      assert Repo.get(AssignmentAttempt, attempt.id) == nil
    end
  end

  describe "attempts" do
    test "the owner's view: student, seed, answers, score; searchable", %{owner: owner} do
      assignment = create!(owner)
      ada = Factory.insert(:account, name: "Ada Lovelace", email: "ada-attempts@example.com")
      bob = Factory.insert(:account, name: "Bob", email: "bob-attempts@example.com")
      {:ok, {ada_attempt, _}} = Exams.start(ada, assignment.code, @now)
      {:ok, _} = Exams.start(bob, assignment.code, DateTime.add(@now, 60))

      {:ok, _} =
        Exams.submit(
          ada,
          ada_attempt.id,
          %{"answers" => %{"r1" => "12"}, "client_score" => 0.5},
          @now
        )

      assert {:ok, {[{first, student}, {_, second}], %{total: 2}}} =
               Assignments.attempts(owner, assignment.id, %{})

      assert student.email == "ada-attempts@example.com"
      assert second.name == "Bob"
      assert first.seed == ada_attempt.seed
      assert first.answers == %{"r1" => "12"}
      assert first.client_score == 0.5
      assert first.submitted_at == @now

      assert {:ok, {[{_, %{name: "Bob"}}], _}} =
               Assignments.attempts(owner, assignment.id, %{"search" => "bob-att"})

      assert {:error, :not_found} = Assignments.attempts(ada, assignment.id, %{})
    end
  end

  describe "purge_expired" do
    test "deletes 365 days past closing, or past creation without a close", %{owner: owner} do
      old_closed =
        create!(owner, %{
          "closes_at" => "2025-11-10T00:00:00Z",
          "opens_at" => "2025-11-01T00:00:00Z"
        })

      recent_closed =
        create!(owner, %{
          "closes_at" => "2025-11-13T00:00:00Z",
          "opens_at" => "2025-11-01T00:00:00Z"
        })

      old_open = create!(owner)
      recent_open = create!(owner)

      {:ok, {attempt, _}} =
        Exams.start(Factory.insert(:account), old_closed.code, ~U[2025-11-05 00:00:00Z])

      Repo.update_all(
        from(a in Assignment, where: a.id in ^[old_closed.id, recent_closed.id, old_open.id]),
        set: [inserted_at: ~U[2025-11-01 00:00:00Z]]
      )

      assert Assignments.purge_expired(@now) == 2

      assert Repo.get(Assignment, old_closed.id) == nil
      assert Repo.get(Assignment, old_open.id) == nil
      assert Repo.get(AssignmentAttempt, attempt.id) == nil
      assert Repo.get(Assignment, recent_closed.id)
      assert Repo.get(Assignment, recent_open.id)
    end

    test "runs with the flag off", %{owner: owner} do
      assignment = create!(owner)
      {:ok, _} = Features.set_assignments_enabled(false)
      assert Assignments.purge_expired(DateTime.add(@now, 366, :day)) == 1
      assert Repo.get(Assignment, assignment.id) == nil
    end
  end
end
