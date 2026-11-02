defmodule StabileoRepo.Repo.Migrations.AddRevisionToProjects do
  use Ecto.Migration

  def change do
    alter table(:projects) do
      add :revision, :integer, null: false, default: 1
    end
  end
end
