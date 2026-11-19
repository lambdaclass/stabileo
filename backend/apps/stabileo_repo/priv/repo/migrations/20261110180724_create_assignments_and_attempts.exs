defmodule StabileoRepo.Repo.Migrations.CreateAssignmentsAndAttempts do
  use Ecto.Migration

  def change do
    create table(:assignments) do
      add :account_id, references(:accounts, on_delete: :delete_all), null: false
      add :title, :string, null: false
      add :exercise, :map, null: false
      add :duration_minutes, :integer, null: false
      add :opens_at, :utc_datetime, null: false
      add :closes_at, :utc_datetime
      add :reveal, :string, null: false
      add :code, :string, null: false

      timestamps(type: :utc_datetime)
    end

    create table(:assignment_attempts) do
      add :assignment_id, references(:assignments, on_delete: :delete_all), null: false
      add :account_id, references(:accounts, on_delete: :delete_all), null: false
      add :seed, :bigint, null: false
      add :started_at, :utc_datetime, null: false
      add :deadline_at, :utc_datetime, null: false
      add :answers, :map, null: false, default: %{}
      add :client_score, :float
      add :submitted_at, :utc_datetime

      timestamps(type: :utc_datetime)
    end
  end
end
