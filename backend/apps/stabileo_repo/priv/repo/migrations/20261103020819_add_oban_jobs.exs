defmodule StabileoRepo.Repo.Migrations.AddObanJobs do
  use Ecto.Migration

  def up, do: Oban.Migration.up(version: 14)

  def down, do: Oban.Migration.down(version: 1)
end
