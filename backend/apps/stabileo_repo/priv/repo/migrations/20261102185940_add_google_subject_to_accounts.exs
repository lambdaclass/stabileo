defmodule StabileoRepo.Repo.Migrations.AddGoogleSubjectToAccounts do
  use Ecto.Migration

  def change do
    alter table(:accounts) do
      add :google_subject, :string
    end
  end
end
