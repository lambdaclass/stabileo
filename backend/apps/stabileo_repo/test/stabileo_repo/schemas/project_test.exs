defmodule StabileoRepo.Schemas.ProjectTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.Project

  defp valid_attrs(account) do
    %{
      account_id: account.id,
      name: "Pórtico",
      app_mode: "basic",
      content: :zlib.gzip(~s({"version":"2.0"})),
      content_bytes: 16
    }
  end

  test "inserts with the required fields" do
    account = Factory.insert(:account)

    assert {:ok, project} =
             %Project{}
             |> Project.create_changeset(
               Map.merge(valid_attrs(account), %{node_count: 4, element_count: 3})
             )
             |> Repo.insert()

    saved = Repo.get!(Project, project.id)
    assert saved.account_id == account.id
    assert saved.name == "Pórtico"
    assert saved.is_active == true
    assert :zlib.gunzip(saved.content) == ~s({"version":"2.0"})
    assert saved.node_count == 4
  end

  for field <- [:account_id, :name, :app_mode, :content, :content_bytes] do
    test "requires #{field}" do
      account = Factory.insert(:account)

      changeset =
        Project.create_changeset(%Project{}, Map.delete(valid_attrs(account), unquote(field)))

      assert %{unquote(field) => ["can't be blank"]} = errors_on(changeset)
    end
  end

  test "rejects an unknown mode and a blank name" do
    account = Factory.insert(:account)

    changeset =
      Project.create_changeset(%Project{}, %{valid_attrs(account) | app_mode: "edu", name: "   "})

    errors = errors_on(changeset)
    assert errors.app_mode == ["is invalid"]
    assert errors.name == ["can't be blank"]
  end

  test "update never changes the owner" do
    account = Factory.insert(:account)
    other = Factory.insert(:account)
    {:ok, project} = %Project{} |> Project.create_changeset(valid_attrs(account)) |> Repo.insert()

    changeset = Project.update_changeset(project, %{account_id: other.id, name: "Renamed"})
    assert changeset.valid?
    {:ok, updated} = Repo.update(changeset)
    assert updated.account_id == account.id
    assert updated.name == "Renamed"
  end

  test "unknown key (user_id instead of account_id) is dropped by cast" do
    account = Factory.insert(:account)
    attrs = account |> valid_attrs() |> Map.delete(:account_id) |> Map.put(:user_id, account.id)
    changeset = Project.create_changeset(%Project{}, attrs)
    refute changeset.valid?
    assert %{account_id: ["can't be blank"]} = errors_on(changeset)
  end
end
