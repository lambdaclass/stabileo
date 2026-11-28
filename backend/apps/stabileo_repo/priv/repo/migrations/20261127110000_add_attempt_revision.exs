defmodule StabileoRepo.Repo.Migrations.AddAttemptRevision do
  use Ecto.Migration

  def change do
    alter table(:assignment_attempts) do
      add(:revision, :integer, null: false, default: 0)
    end
  end
end
