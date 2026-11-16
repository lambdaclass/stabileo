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
    {:ok, _} = Features.set_cloud_projects_limit(5)
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

    assert {:error, :not_found} =
             Projects.update(account, theirs.id, %{"name" => "Mine now", "revision" => 1})

    assert {:error, :not_found} = Projects.delete(account, theirs.id)
    assert {:error, :not_found} = Projects.get(account, "not-a-uuid")
    assert Repo.get!(Project, theirs.id).name == "Pórtico"
  end

  test "update renames and replaces the content, one revision each", %{account: account} do
    {:ok, project} = Projects.create(account, attrs())
    assert project.revision == 1
    {:ok, renamed} = Projects.update(account, project.id, %{"name" => "Renamed", "revision" => 1})
    assert renamed.revision == 2

    {:ok, replaced} =
      Projects.update(account, project.id, %{
        "content" => content(%{"version" => "2.1"}),
        "revision" => 2
      })

    assert replaced.revision == 3
    saved = Repo.get!(Project, project.id)
    assert saved.name == "Renamed"
    assert saved.revision == 3
    assert Jason.decode!(:zlib.gunzip(saved.content)) == %{"version" => "2.1"}
  end

  test "a save from a stale revision is refused and changes nothing", %{account: account} do
    {:ok, project} = Projects.create(account, attrs())
    {:ok, _} = Projects.update(account, project.id, %{"name" => "Other tab", "revision" => 1})

    assert {:error, :project_conflict} =
             Projects.update(account, project.id, %{
               "content" => content(%{"version" => "old"}),
               "revision" => 1
             })

    saved = Repo.get!(Project, project.id)
    assert saved.name == "Other tab"
    assert saved.revision == 2
    assert Jason.decode!(:zlib.gunzip(saved.content))["version"] == "2.0"
  end

  test "update needs the revision it was read at", %{account: account} do
    {:ok, project} = Projects.create(account, attrs())

    assert {:error, {:validation, %{revision: ["can't be blank"]}}} =
             Projects.update(account, project.id, %{"name" => "x"})

    assert {:error, {:validation, %{revision: ["is invalid"]}}} =
             Projects.update(account, project.id, %{"name" => "x", "revision" => "1"})

    assert Repo.get!(Project, project.id).name == "Pórtico"
  end

  test "delete keeps the row, inactive, and drops the content", %{account: account} do
    {:ok, project} = Projects.create(account, attrs())
    {:ok, _} = Projects.delete(account, project.id)
    saved = Repo.get!(Project, project.id)
    assert saved.is_active == false
    assert saved.content == nil
    assert saved.content_bytes == 0
    assert {:error, :not_found} = Projects.get(account, project.id)
  end

  test "a save read before a delete does not write into the deleted project", %{account: account} do
    {:ok, project} = Projects.create(account, attrs())
    {:ok, _} = Projects.delete(account, project.id)
    stale = Project.update_changeset(%{project | revision: 1}, %{"name" => "Still here?"})

    assert {:error, %Ecto.Changeset{errors: errors}} =
             Repo.update(stale, stale_error_field: :revision)

    assert Keyword.has_key?(errors, :revision)
    saved = Repo.get!(Project, project.id)
    refute saved.is_active
    assert saved.name == "Pórtico"
    assert saved.content == nil
  end

  test "a rename to null answers which field failed instead of raising", %{account: account} do
    {:ok, project} = Projects.create(account, attrs())

    assert {:error, changeset} =
             Projects.update(account, project.id, %{"name" => nil, "revision" => 1})

    assert %{name: ["can't be blank"]} = errors_on(changeset)
  end

  test "admin_list ignores a filter that is not a string", %{account: account} do
    {:ok, project} = Projects.create(account, attrs())

    assert {[{listed, _, _}], %{total: 1}} =
             Projects.admin_list(%{"search" => ["x"], "app_mode" => %{"a" => 1}})

    assert listed.id == project.id
  end

  test "list meta counts every active project, whatever the search", %{account: account} do
    {:ok, _} = Features.set_cloud_projects_limit(5)
    {:ok, _} = Projects.create(account, attrs(%{"name" => "Truss"}))
    {:ok, _} = Projects.create(account, attrs(%{"name" => "Frame"}))

    assert {:ok, {[_], meta}} = Projects.list(account, %{"search" => "Truss"})
    assert meta.total == 1
    assert meta.used == 2
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

  test "one project per account unless an admin sets another limit", %{account: account} do
    assert Projects.limits().max_projects == 1
    assert {:ok, _} = Projects.create(account, attrs(%{"name" => "First"}))

    assert {:error, :project_limit_reached} =
             Projects.create(account, attrs(%{"name" => "Second"}))

    {:ok, _} = Features.set_cloud_projects_limit(2)
    assert Projects.limits().max_projects == 2
    assert {:ok, second} = Projects.create(account, attrs(%{"name" => "Second"}))
    assert Repo.get!(Project, second.id).name == "Second"
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
