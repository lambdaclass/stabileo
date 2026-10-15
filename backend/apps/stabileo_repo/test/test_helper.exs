ExUnit.start()

Ecto.Adapters.SQL.Sandbox.mode(StabileoRepo.Repo, :manual)

{:ok, _} = Application.ensure_all_started(:stabileo_repo)
