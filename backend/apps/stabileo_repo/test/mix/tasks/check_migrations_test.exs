defmodule Mix.Tasks.Stabileo.CheckMigrationsTest do
  use ExUnit.Case
  import ExUnit.CaptureIO

  alias Mix.Tasks.Stabileo.CheckMigrations

  describe "run/1" do
    test "exercises all code paths" do
      Code.ensure_loaded!(CheckMigrations)
      assert function_exported?(CheckMigrations, :run, 1)

      tmp_dir = System.tmp_dir!()
      dir = Path.join(tmp_dir, "check_mig_test_#{:erlang.unique_integer([:positive])}")
      File.mkdir_p!(dir)

      original_shell = Mix.shell()
      Mix.shell(Mix.Shell.IO)

      try do
        f_safe =
          write_migration(dir, "20260301000010", """
          defmodule Repo.Migrations.Safe do
            use Ecto.Migration
            def change do
              alter table("users") do
                add :bio, :text
              end
            end
          end
          """)

        output = capture_io(fn -> CheckMigrations.run(["--file", f_safe, "--all"]) end)
        assert output =~ "passed"

        f_old =
          write_migration(dir, "20260101000000", """
          defmodule Repo.Migrations.BeforeBaseline do
            use Ecto.Migration
            def change do
              alter table("users") do
                add :nickname, :text
              end
            end
          end
          """)

        output = capture_io(fn -> CheckMigrations.run(["--file", f_old]) end)
        assert output =~ "Checking 1 migration(s)"
        assert output =~ "passed"
        refute output =~ "No migrations to check"

        f_skip =
          write_migration(dir, "20260301000011", """
          defmodule Repo.Migrations.Skipped do
            use Ecto.Migration
            def change do
              rename table("old"), to: table("new") # safety:skip
            end
          end
          """)

        output = capture_io(fn -> CheckMigrations.run(["--file", f_skip, "--all"]) end)
        assert output =~ "passed"

        f_create =
          write_migration(dir, "20260301000012", """
          defmodule Repo.Migrations.CreateSafe do
            use Ecto.Migration
            def change do
              create table("things") do
                add :name, :string, null: false
              end
            end
          end
          """)

        output = capture_io(fn -> CheckMigrations.run(["--file", f_create, "--all"]) end)
        refute output =~ "Adding NOT NULL column without default"

        output =
          capture_io(fn ->
            CheckMigrations.run(["--file", f_safe, "--after", "20270101000000"])
          end)

        assert output =~ "No migrations to check"

        f_medium =
          write_migration(dir, "20260301000020", """
          defmodule Repo.Migrations.Medium do
            use Ecto.Migration
            def change do
              alter table("users") do
                add :ref_id, references(:other)
              end
            end
          end
          """)

        output =
          capture_io(fn -> CheckMigrations.run(["--file", f_medium, "--all", "--verbose"]) end)

        assert output =~ "on_delete"

        f_high =
          write_migration(dir, "20260301000021", """
          defmodule Repo.Migrations.High do
            use Ecto.Migration
            def change do
              drop table("old_table")
            end
          end
          """)

        output =
          capture_io(fn -> CheckMigrations.run(["--file", f_high, "--all", "--verbose"]) end)

        assert output =~ "DROP TABLE"

        f_index =
          write_migration(dir, "20260301000022", """
          defmodule Repo.Migrations.BadIndex do
            use Ecto.Migration
            def change do
              create index("users", [:email])
            end
          end
          """)

        output =
          capture_io(fn -> CheckMigrations.run(["--file", f_index, "--all", "--verbose"]) end)

        assert output =~ "CONCURRENTLY"

        f_rename_table =
          write_migration(dir, "20260301000030", """
          defmodule Repo.Migrations.RenameT do
            use Ecto.Migration
            def change do
              rename table("old"), to: table("new")
            end
          end
          """)

        output =
          capture_io(fn ->
            CheckMigrations.run(["--file", f_rename_table, "--all", "--verbose"])
          end)

        assert output =~ "RENAME TABLE"
        assert output =~ "critical"
        assert output =~ "Renaming tables breaks"

        f_rename_col =
          write_migration(dir, "20260301000031", """
          defmodule Repo.Migrations.RenameC do
            use Ecto.Migration
            def change do
              rename table("users"), :old_name, to: :new_name
            end
          end
          """)

        output =
          capture_io(fn ->
            CheckMigrations.run(["--file", f_rename_col, "--all", "--verbose"])
          end)

        assert output =~ "RENAME COLUMN"

        f_not_null =
          write_migration(dir, "20260301000032", """
          defmodule Repo.Migrations.ModNotNull do
            use Ecto.Migration
            def change do
              alter table("users") do
                modify :name, :string, null: false
              end
            end
          end
          """)

        output =
          capture_io(fn -> CheckMigrations.run(["--file", f_not_null, "--all", "--verbose"]) end)

        assert output =~ "NOT NULL"

        f_add_not_null =
          write_migration(dir, "20260301000033", """
          defmodule Repo.Migrations.AddNotNull do
            use Ecto.Migration
            def change do
              alter table("users") do
                add :role, :string, null: false
              end
            end
          end
          """)

        output =
          capture_io(fn ->
            CheckMigrations.run(["--file", f_add_not_null, "--all", "--verbose"])
          end)

        assert output =~ "NOT NULL"

        f_remove =
          write_migration(dir, "20260301000034", """
          defmodule Repo.Migrations.RemoveCol do
            use Ecto.Migration
            def change do
              alter table("users") do
                remove :old_field, :string
              end
            end
          end
          """)

        output =
          capture_io(fn -> CheckMigrations.run(["--file", f_remove, "--all", "--verbose"]) end)

        assert output =~ "remove column"

        f_timestamps =
          write_migration(dir, "20260301000035", """
          defmodule Repo.Migrations.BadTimestamps do
            use Ecto.Migration
            def change do
              create table("items") do
                add :name, :string
                timestamps()
              end
            end
          end
          """)

        output =
          capture_io(fn ->
            CheckMigrations.run(["--file", f_timestamps, "--all", "--verbose"])
          end)

        assert output =~ "timestamps"

        f_multi =
          write_migration(dir, "20260301000036", """
          defmodule Repo.Migrations.Multi do
            use Ecto.Migration
            def change do
              rename table("a"), to: table("b")
              drop table("c")
              create index("d", [:e])
            end
          end
          """)

        output = capture_io(fn -> CheckMigrations.run(["--file", f_multi, "--all"]) end)
        assert output =~ "critical"
        assert output =~ "issue"

        non_verbose_output =
          capture_io(fn -> CheckMigrations.run(["--file", f_rename_table, "--all"]) end)

        assert non_verbose_output =~ "RENAME TABLE"
        refute non_verbose_output =~ "Renaming tables breaks"
      after
        Mix.shell(original_shell)
        File.rm_rf!(dir)
      end
    end
  end

  defp write_migration(dir, timestamp, content) do
    path = Path.join(dir, "#{timestamp}_test_migration.exs")
    File.write!(path, content)
    path
  end
end
