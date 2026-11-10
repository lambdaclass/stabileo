defmodule StabileoProjects.ProjectsConcurrencyTest do
  use ExUnit.Case, async: false

  alias Ecto.Adapters.SQL.Sandbox
  alias StabileoProjects.Projects
  alias StabileoRepo.{Factory, Features, Repo, SystemSettings}
  alias StabileoRepo.Schemas.{Account, Project}

  setup do
    Sandbox.mode(Repo, :auto)
    {:ok, _} = Features.set_cloud_projects_enabled(true)
    account = Factory.insert(:account)

    on_exit(fn ->
      Sandbox.mode(Repo, :auto)
      Repo.delete_all(Project)
      Repo.delete(%Account{id: account.id})
      SystemSettings.delete("cloud_projects_enabled")
      Sandbox.mode(Repo, :manual)
    end)

    %{account: account}
  end

  test "saves racing at the limit create exactly one project", %{account: account} do
    content = ~s({"version":"2.0"}) |> :zlib.gzip() |> Base.encode64()
    parent = self()

    tasks =
      for i <- 1..8 do
        Task.async(fn ->
          send(parent, {:ready, self()})

          receive do
            :go ->
              Projects.create(account, %{
                "name" => "p#{i}",
                "app_mode" => "basic",
                "content" => content
              })
          end
        end)
      end

    pids = for _ <- tasks, do: receive(do: ({:ready, pid} -> pid))
    Enum.each(pids, &send(&1, :go))
    results = Task.await_many(tasks, 15_000)

    assert Enum.count(results, &match?({:ok, _}, &1)) == 1
    assert Enum.count(results, &(&1 == {:error, :project_limit_reached})) == 7
    assert Repo.aggregate(Project, :count) == 1
  end
end
