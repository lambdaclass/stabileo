defmodule StabileoAssignments.Controllers.AssignmentControllerTest do
  use StabileoAssignments.ConnCase, async: false

  alias StabileoAssignments.Exams
  alias StabileoRepo.Features
  alias StabileoRepo.Schemas.{Assignment, AssignmentAttempt}

  @keys ~w(attempt_count closes_at code duration_minutes id inserted_at opens_at reveal submitted_count title updated_at)
  @attempt_keys ~w(answers client_score deadline_at id seed started_at student submitted_at)

  setup do
    {:ok, _} = Features.set_assignments_enabled(true)
    owner = Factory.insert(:account, name: "Prof. Pérez")
    %{owner: owner, token: log_in(owner)}
  end

  defp body(overrides \\ %{}) do
    Map.merge(
      %{
        "title" => "TP 3: vigas",
        "exercise" => %{"id" => "beam-1", "params" => %{"L" => [2, 6]}},
        "duration_minutes" => 90,
        "closes_at" => DateTime.utc_now() |> DateTime.add(3, :day) |> DateTime.to_iso8601(),
        "reveal" => "after_close"
      },
      overrides
    )
  end

  defp create(token, overrides \\ %{}),
    do: request(:post, "/", body(overrides), token) |> json_body(201) |> Map.fetch!("data")

  test "POST / creates and answers the assignment with its exercise", %{
    owner: owner,
    token: token
  } do
    data = create(token)
    assert Enum.sort(Map.keys(data)) == Enum.sort(["exercise" | @keys])
    assert data["title"] == "TP 3: vigas"
    assert data["exercise"] == %{"id" => "beam-1", "params" => %{"L" => [2, 6]}}
    assert data["code"] =~ ~r/^[2-9A-HJ-NP-Z]{10}$/
    assert data["attempt_count"] == 0
    assert data["reveal"] == "after_close"
    assert Repo.get!(Assignment, data["id"]).account_id == owner.id
  end

  test "GET / lists mine with counts and the limit; GET /:id adds the exercise", %{token: token} do
    data = create(token)
    create(log_in(Factory.insert(:account)))

    list = request(:get, "/", %{}, token) |> json_body(200)
    assert [row] = list["data"]
    assert Enum.sort(Map.keys(row)) == @keys
    assert list["meta"]["total"] == 1
    assert list["meta"]["max_assignments"] == 100

    show = request(:get, "/#{data["id"]}", %{}, token) |> json_body(200)
    assert show["data"]["exercise"]["id"] == "beam-1"
  end

  test "PUT /:id updates; 409 assignment_started on the exercise once started", %{token: token} do
    data = create(token)

    updated =
      request(:put, "/#{data["id"]}", %{"title" => "Recuperatorio"}, token) |> json_body(200)

    assert updated["data"]["title"] == "Recuperatorio"

    {:ok, _} = Exams.start(Factory.insert(:account), data["code"])

    body =
      request(:put, "/#{data["id"]}", %{"exercise" => %{"id" => "other"}}, token)
      |> json_body(409)

    assert body["error"] == "assignment_started"
    assert Repo.get!(Assignment, data["id"]).exercise["id"] == "beam-1"
  end

  test "DELETE /:id removes it and its attempts", %{token: token} do
    data = create(token)
    {:ok, {attempt, _}} = Exams.start(Factory.insert(:account), data["code"])

    deleted = request(:delete, "/#{data["id"]}", %{}, token) |> json_body(200)
    assert deleted["data"]["id"] == data["id"]
    assert deleted["data"]["attempt_count"] == 1
    assert Repo.get(Assignment, data["id"]) == nil
    assert Repo.get(AssignmentAttempt, attempt.id) == nil
  end

  test "GET /:id/attempts lists students with seed, answers and score", %{token: token} do
    data = create(token)
    student = Factory.insert(:account, name: "Ada", email: "ada-ctrl@example.com")
    {:ok, {attempt, _}} = Exams.start(student, data["code"])

    {:ok, _} =
      Exams.submit(student, attempt.id, %{"answers" => %{"r1" => "12"}, "client_score" => 0.5})

    body = request(:get, "/#{data["id"]}/attempts", %{}, token) |> json_body(200)
    assert [row] = body["data"]
    assert Enum.sort(Map.keys(row)) == @attempt_keys

    assert row["student"] == %{
             "id" => student.id,
             "name" => "Ada",
             "email" => "ada-ctrl@example.com"
           }

    assert row["seed"] == attempt.seed
    assert row["answers"] == %{"r1" => "12"}
    assert row["client_score"] == 0.5
    assert row["submitted_at"]
    assert body["meta"]["total"] == 1
  end

  test "422 with the failing field", %{token: token} do
    body =
      request(:post, "/", body(%{"title" => " ", "closes_at" => nil}), token) |> json_body(422)

    assert body["error"] == "validation_error"
    assert body["details"]["title"] == ["can't be blank"]
    assert body["details"]["closes_at"] == ["is required when results show after closing"]
    assert Repo.aggregate(Assignment, :count) == 0
  end

  test "another account's assignment is a 404 on every route", %{token: token} do
    id = create(token)["id"]
    other = log_in(Factory.insert(:account))

    for {method, path, params} <- [
          {:get, "/#{id}", %{}},
          {:put, "/#{id}", %{"title" => "Mine now"}},
          {:delete, "/#{id}", %{}},
          {:get, "/#{id}/attempts", %{}}
        ] do
      body = request(method, path, params, other) |> json_body(404)
      assert body["error"] == "not_found"
    end

    assert request(:get, "/not-a-uuid", %{}, token) |> json_body(404) |> Map.get("error") ==
             "not_found"

    assert Repo.get!(Assignment, id).title == "TP 3: vigas"
  end

  test "403 assignments_disabled while the flag is off", %{token: token} do
    id = create(token)["id"]
    {:ok, _} = Features.set_assignments_enabled(false)

    for {method, path} <- [{:get, "/"}, {:post, "/"}, {:get, "/#{id}"}, {:delete, "/#{id}"}] do
      body = request(method, path, body(), token) |> json_body(403)
      assert body["error"] == "assignments_disabled"
    end

    assert Repo.get(Assignment, id)
  end

  test "401 without a token" do
    body = request(:get, "/") |> json_body(401)
    assert body["error"] == "missing_token"
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

    test "429 past 60 requests a minute from one account; another account goes on", %{
      token: token
    } do
      for _ <- 1..60, do: request(:get, "/", %{}, token) |> json_body(200)

      assert request(:get, "/", %{}, token) |> json_body(429) |> Map.get("error") ==
               "rate_limited"

      request(:get, "/", %{}, log_in(Factory.insert(:account))) |> json_body(200)
    end
  end
end
