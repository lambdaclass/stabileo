defmodule StabileoAssignments.ExamRouter do
  @moduledoc "Mounted at /api/v1/exams by `StabileoWeb.Router`: the student's side."

  use Phoenix.Router, helpers: false

  import Phoenix.Controller

  pipeline :api do
    plug(:accepts, ["json"])
    plug(StabileoUtils.Plugs.VersionHeader)
    plug(StabileoRepo.Plugs.RequestMetadata)
    plug(StabileoAuth.Plugs.Authenticate)

    plug(StabileoUtils.Plugs.RateLimit,
      bucket: :exams,
      limit: 60,
      period_ms: 60_000,
      key: :account
    )
  end

  scope "/", StabileoAssignments.Controllers do
    pipe_through(:api)

    get("/attempts/:id", ExamController, :attempt)
    put("/attempts/:id/answers", ExamController, :answers)
    post("/attempts/:id/submit", ExamController, :submit)
    get("/:code", ExamController, :show)
    post("/:code/start", ExamController, :start)
  end
end
