defmodule StabileoAssignments.Controllers.ExamControllerTest do
  use StabileoAssignments.ConnCase, async: false

  import Ecto.Query

  alias StabileoAssignments.Assignments
  alias StabileoRepo.Features
  alias StabileoRepo.Schemas.{Assignment, AssignmentAttempt}

  @exam_keys ~w(attempt closes_at code duration_minutes now opens_at owner_name reveal status title)
  @attempt_keys ~w(answers client_score closed closes_at code deadline_at exercise id now reveal reveal_allowed seed started_at submitted_at title)

  setup do
    {:ok, _} = Features.set_assignments_enabled(true)
    owner = Factory.insert(:account, name: "Prof. Pérez")
    student = Factory.insert(:account, name: "Ada")

    {:ok, {assignment, _}} =
      Assignments.create(owner, %{
        "title" => "Parcial 1",
        "exercise" => %{"id" => "beam-1"},
        "duration_minutes" => 60,
        "reveal" => "on_submit"
      })

    %{assignment: assignment, token: log_in(student), student: student}
  end

  defp start(code, token), do: exam_request(:post, "/#{code}/start", %{}, token)

  defp shift(id, field, seconds) do
    Repo.update_all(from(t in AssignmentAttempt, where: t.id == ^id),
      set: [{field, DateTime.utc_now() |> DateTime.add(seconds) |> DateTime.truncate(:second)}]
    )
  end

  test "GET /:code shows the public facts, never the exercise", %{assignment: a, token: token} do
    body = exam_request(:get, "/#{String.downcase(a.code)}", %{}, token) |> json_body(200)
    assert Enum.sort(Map.keys(body["data"])) == @exam_keys
    assert body["data"]["title"] == "Parcial 1"
    assert body["data"]["owner_name"] == "Prof. Pérez"
    assert body["data"]["status"] == "open"
    assert body["data"]["attempt"] == nil

    id = (start(a.code, token) |> json_body(200))["data"]["id"]
    after_start = exam_request(:get, "/#{a.code}", %{}, token) |> json_body(200)
    assert after_start["data"]["attempt"]["id"] == id

    assert Map.keys(after_start["data"]["attempt"]) |> Enum.sort() ==
             ~w(deadline_at id started_at submitted_at)
  end

  test "POST /:code/start answers the attempt with seed, deadline, clock and exercise", %{
    assignment: a,
    token: token,
    student: student
  } do
    data = (start(a.code, token) |> json_body(200))["data"]
    assert Enum.sort(Map.keys(data)) == @attempt_keys
    assert data["exercise"] == %{"id" => "beam-1"}
    assert data["closed"] == false
    assert data["reveal_allowed"] == false
    assert data["answers"] == %{}

    saved = Repo.get!(AssignmentAttempt, data["id"])
    assert saved.account_id == student.id
    assert data["seed"] == saved.seed
    assert DateTime.diff(saved.deadline_at, saved.started_at, :minute) == 60

    again = (start(a.code, token) |> json_body(200))["data"]
    assert {again["id"], again["seed"]} == {data["id"], data["seed"]}
  end

  test "409 assignment_not_open before opens_at and assignment_closed after closes_at", %{
    assignment: a,
    token: token
  } do
    Repo.update_all(from(x in Assignment, where: x.id == ^a.id),
      set: [opens_at: DateTime.utc_now() |> DateTime.add(3600) |> DateTime.truncate(:second)]
    )

    assert start(a.code, token) |> json_body(409) |> Map.get("error") == "assignment_not_open"

    Repo.update_all(from(x in Assignment, where: x.id == ^a.id),
      set: [
        opens_at: ~U[2026-01-01 00:00:00Z],
        closes_at: DateTime.utc_now() |> DateTime.add(-60) |> DateTime.truncate(:second)
      ]
    )

    assert start(a.code, token) |> json_body(409) |> Map.get("error") == "assignment_closed"
    assert Repo.aggregate(AssignmentAttempt, :count) == 0
  end

  test "PUT answers, then submit, then both are attempt_submitted", %{assignment: a, token: token} do
    id = (start(a.code, token) |> json_body(200))["data"]["id"]

    saved =
      exam_request(:put, "/attempts/#{id}/answers", %{"answers" => %{"r1" => "12"}}, token)
      |> json_body(200)

    assert saved["data"]["answers"] == %{"r1" => "12"}

    submitted =
      exam_request(:post, "/attempts/#{id}/submit", %{"client_score" => 0.5}, token)
      |> json_body(200)

    assert submitted["data"]["submitted_at"]
    assert submitted["data"]["closed"] == true
    assert submitted["data"]["reveal_allowed"] == true
    assert submitted["data"]["answers"] == %{"r1" => "12"}

    again = exam_request(:post, "/attempts/#{id}/submit", %{}, token) |> json_body(409)
    assert again["error"] == "attempt_submitted"

    late =
      exam_request(:put, "/attempts/#{id}/answers", %{"answers" => %{"r1" => "x"}}, token)
      |> json_body(409)

    assert late["error"] == "attempt_submitted"
    saved = Repo.get!(AssignmentAttempt, id)
    assert saved.answers == %{"r1" => "12"}
    assert saved.client_score == 0.5
  end

  test "past the deadline and grace: 409 attempt_closed, the autosave stays, the attempt reads closed",
       %{assignment: a, token: token} do
    id = (start(a.code, token) |> json_body(200))["data"]["id"]

    exam_request(:put, "/attempts/#{id}/answers", %{"answers" => %{"r1" => "kept"}}, token)
    |> json_body(200)

    shift(id, :deadline_at, -31)

    body =
      exam_request(:post, "/attempts/#{id}/submit", %{"answers" => %{"r1" => "late"}}, token)
      |> json_body(409)

    assert body["error"] == "attempt_closed"
    assert Repo.get!(AssignmentAttempt, id).answers == %{"r1" => "kept"}

    read = exam_request(:get, "/attempts/#{id}", %{}, token) |> json_body(200)
    assert read["data"]["closed"] == true
    assert read["data"]["reveal_allowed"] == true
    assert read["data"]["submitted_at"] == nil
  end

  test "422 with the failing field", %{assignment: a, token: token} do
    id = (start(a.code, token) |> json_body(200))["data"]["id"]

    missing = exam_request(:put, "/attempts/#{id}/answers", %{}, token) |> json_body(422)
    assert missing["details"] == %{"answers" => ["can't be blank"]}

    score =
      exam_request(:post, "/attempts/#{id}/submit", %{"client_score" => 2}, token)
      |> json_body(422)

    assert score["error"] == "validation_error"
    assert [_] = score["details"]["client_score"]
    assert Repo.get!(AssignmentAttempt, id).submitted_at == nil
  end

  test "404 for an unknown code and for another account's attempt", %{assignment: a, token: token} do
    assert exam_request(:get, "/ZZZZZZZZZZ", %{}, token) |> json_body(404) |> Map.get("error") ==
             "not_found"

    assert start("ZZZZZZZZZZ", token) |> json_body(404) |> Map.get("error") == "not_found"

    id = (start(a.code, token) |> json_body(200))["data"]["id"]
    other = log_in(Factory.insert(:account))

    for {method, path, params} <- [
          {:get, "/attempts/#{id}", %{}},
          {:put, "/attempts/#{id}/answers", %{"answers" => %{"r1" => "theirs"}}},
          {:post, "/attempts/#{id}/submit", %{}}
        ] do
      assert exam_request(method, path, params, other) |> json_body(404) |> Map.get("error") ==
               "not_found"
    end

    saved = Repo.get!(AssignmentAttempt, id)
    assert saved.answers == %{}
    assert saved.submitted_at == nil
  end

  test "403 assignments_disabled while the flag is off", %{assignment: a, token: token} do
    id = (start(a.code, token) |> json_body(200))["data"]["id"]
    {:ok, _} = Features.set_assignments_enabled(false)

    for {method, path} <- [
          {:get, "/#{a.code}"},
          {:post, "/#{a.code}/start"},
          {:get, "/attempts/#{id}"},
          {:put, "/attempts/#{id}/answers"},
          {:post, "/attempts/#{id}/submit"}
        ] do
      body = exam_request(method, path, %{"answers" => %{}}, token) |> json_body(403)
      assert body["error"] == "assignments_disabled"
    end
  end

  test "401 without a token", %{assignment: a} do
    assert exam_request(:get, "/#{a.code}") |> json_body(401) |> Map.get("error") ==
             "missing_token"

    assert start(a.code, nil) |> json_body(401) |> Map.get("error") == "missing_token"
  end
end
