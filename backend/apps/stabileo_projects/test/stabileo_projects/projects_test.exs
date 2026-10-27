defmodule StabileoProjects.ProjectsTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoAuth.Consents
  alias StabileoProjects.Projects
  alias StabileoRepo.{Factory, Features}
  alias StabileoRepo.Schemas.Project

  setup do
    {:ok, _} = Features.set_cloud_projects_enabled(true)
    %{account: Factory.insert(:account)}
  end

  defp content(map \\ %{"version" => "2.0", "name" => "Pórtico"}),
    do: map |> Jason.encode!() |> :zlib.gzip() |> Base.encode64()

  defp attrs(overrides \\ %{}),
    do:
      Map.merge(
        %{"name" => "Pórtico", "app_mode" => "basic", "content" => content(), "node_count" => 4},
        overrides
      )

  test "create stores the gzip and the uncompressed size", %{account: account} do
    assert {:ok, project} = Projects.create(account, attrs())
    saved = Repo.get!(Project, project.id)
    assert saved.account_id == account.id
    assert saved.app_mode == "basic"
    assert saved.node_count == 4

    assert Jason.decode!(:zlib.gunzip(saved.content)) == %{
             "version" => "2.0",
             "name" => "Pórtico"
           }

    assert saved.content_bytes ==
             byte_size(Jason.encode!(%{"version" => "2.0", "name" => "Pórtico"}))
  end

  test "create never takes the owner from the input", %{account: account} do
    other = Factory.insert(:account)
    {:ok, project} = Projects.create(account, attrs(%{"account_id" => other.id}))
    assert Repo.get!(Project, project.id).account_id == account.id
  end

  test "create answers which field failed", %{account: account} do
    assert {:error, {:validation, %{content: ["can't be blank"]}}} =
             Projects.create(account, Map.delete(attrs(), "content"))

    assert {:error, %Ecto.Changeset{} = changeset} =
             Projects.create(account, attrs(%{"name" => " "}))

    assert %{name: ["can't be blank"]} = errors_on(changeset)

    assert {:error, {:validation, %{content: [_]}}} =
             Projects.create(account, attrs(%{"content" => "nope"}))

    assert Repo.aggregate(Project, :count) == 0
  end

  test "list shows only the owner's active projects, without content", %{account: account} do
    other = Factory.insert(:account)
    {:ok, mine} = Projects.create(account, attrs(%{"name" => "Mine"}))
    {:ok, gone} = Projects.create(account, attrs(%{"name" => "Gone"}))
    {:ok, _theirs} = Projects.create(other, attrs(%{"name" => "Theirs"}))
    {:ok, _} = Projects.delete(account, gone.id)

    assert {:ok, {[row], meta}} = Projects.list(account, %{})
    assert row.id == mine.id
    assert row.content == nil
    assert meta.total == 1

    assert {:ok, {[], _}} = Projects.list(account, %{"search" => "zzz"})
  end

  test "another account's project is not found, to read, change or delete", %{account: account} do
    other = Factory.insert(:account)
    {:ok, theirs} = Projects.create(other, attrs())

    assert {:error, :not_found} = Projects.get(account, theirs.id)
    assert {:error, :not_found} = Projects.update(account, theirs.id, %{"name" => "Mine now"})
    assert {:error, :not_found} = Projects.delete(account, theirs.id)
    assert {:error, :not_found} = Projects.get(account, "not-a-uuid")
    assert Repo.get!(Project, theirs.id).name == "Pórtico"
  end

  test "update renames and replaces the content", %{account: account} do
    {:ok, project} = Projects.create(account, attrs())
    {:ok, _} = Projects.update(account, project.id, %{"name" => "Renamed"})

    {:ok, _} =
      Projects.update(account, project.id, %{"content" => content(%{"version" => "2.1"})})

    saved = Repo.get!(Project, project.id)
    assert saved.name == "Renamed"
    assert Jason.decode!(:zlib.gunzip(saved.content)) == %{"version" => "2.1"}
  end

  test "delete keeps the row, inactive", %{account: account} do
    {:ok, project} = Projects.create(account, attrs())
    {:ok, _} = Projects.delete(account, project.id)
    assert Repo.get!(Project, project.id).is_active == false
    assert {:error, :not_found} = Projects.get(account, project.id)
  end

  test "create refuses past the per-account limit, counting only active projects", %{
    account: account
  } do
    max = Projects.limits().max_projects
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    rows =
      for i <- 1..max do
        %{
          id: Ecto.UUID.generate(),
          account_id: account.id,
          name: "p#{i}",
          app_mode: "basic",
          content: :zlib.gzip("{}"),
          content_bytes: 2,
          is_active: true,
          inserted_at: now,
          updated_at: now
        }
      end

    Repo.insert_all(Project, rows)
    assert {:error, :project_limit_reached} = Projects.create(account, attrs())

    {:ok, {[oldest | _], _}} = Projects.list(account, %{"sort_by" => "name", "sort_dir" => "asc"})
    {:ok, _} = Projects.delete(account, oldest.id)
    assert {:ok, _} = Projects.create(account, attrs())
  end

  test "everything is refused while the flag is off", %{account: account} do
    {:ok, project} = Projects.create(account, attrs())
    {:ok, _} = Features.set_cloud_projects_enabled(false)

    assert {:error, :cloud_projects_disabled} = Projects.list(account, %{})
    assert {:error, :cloud_projects_disabled} = Projects.create(account, attrs())
    assert {:error, :cloud_projects_disabled} = Projects.get(account, project.id)
  end

  test "admin_list shows every owner's projects with their research consent", %{account: account} do
    other = Factory.insert(:account)
    {:ok, _} = Consents.record(other, "model_research", true)
    {:ok, _} = Projects.create(account, attrs(%{"name" => "A"}))
    {:ok, _} = Projects.create(other, attrs(%{"name" => "B", "app_mode" => "pro"}))

    {rows, meta} = Projects.admin_list(%{"sort_by" => "name", "sort_dir" => "asc"})
    assert meta.total == 2
    assert [{a, owner_a, false}, {b, owner_b, true}] = rows
    assert {a.name, owner_a.id} == {"A", account.id}
    assert {b.name, owner_b.id} == {"B", other.id}
    assert a.content == nil

    {rows, _} = Projects.admin_list(%{"app_mode" => "pro"})
    assert [{%{name: "B"}, _, _}] = rows

    {rows, _} = Projects.admin_list(%{"search" => other.email})
    assert [{%{name: "B"}, _, _}] = rows
  end
end
