defmodule StabileoRepo.Repo.Migrations.AddRevisionToProjects do
  use Ecto.Migration

  def change do
    alter table(:projects) do
      add :revision, :integer, null: false, default: 1
    end

    execute(
      "ALTER TABLE projects ALTER COLUMN content DROP NOT NULL",
      "ALTER TABLE projects ALTER COLUMN content SET NOT NULL"
    )
  end
end
