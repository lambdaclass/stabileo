defmodule StabileoRepo.Repo.Migrations.StoreAssignmentTitlesAsText do
  use Ecto.Migration

  def change do
    alter table(:assignments) do
      modify :title, :text, null: false, from: {:string, null: false}
    end
  end
end
