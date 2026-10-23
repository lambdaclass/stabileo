defmodule Mix.Tasks.Stabileo.CheckMigrations do
  @moduledoc """
  Checks migrations for production safety issues.

  This task analyzes migration files for dangerous patterns that could cause
  downtime, data loss, or table locks in production.

  ## Usage

      mix stabileo.check_migrations                    # Check all migrations
      mix stabileo.check_migrations --pending          # Check only pending migrations
      mix stabileo.check_migrations --after 20260201   # Check migrations after this version
      mix stabileo.check_migrations --file FILE        # Check a specific file

  ## Skipping Checks

  Add `# safety:skip` at the end of a line to suppress warnings for that line.

  ## Exit Codes

      0 - All checks passed
      1 - Issues found
  """

  @baseline_version 0

  use Mix.Task

  @shortdoc "Check migrations for production safety issues"

  defp dangerous_patterns do
    [
      {"rename\\s+table\\(.*\\),\\s*to:\\s*table\\(", :critical, "RENAME TABLE",
       "Renaming tables breaks running code instantly. Use add new → migrate data → remove old pattern.",
       :any},
      {"rename\\s+table\\(.*\\),\\s*:\\w+,\\s*to:", :critical, "RENAME COLUMN",
       "Renaming columns breaks running code instantly. Use add new → migrate data → remove old pattern.",
       :any},
      {"drop\\s+table", :high, "DROP TABLE",
       "Ensure no code references this table. Deploy code removal first.", :any},
      {"drop\\s+column", :high, "DROP COLUMN",
       "Ensure no code references this column. Deploy code removal first.", :any},
      {"remove\\s+:[\\w]+,\\s*:[\\w]+[^,]*$", :high, "remove column (Ecto)",
       "Ensure no code references this column. Deploy code removal first.", :any},
      {"modify.*null:\\s*false", :critical, "Adding NOT NULL to existing column",
       "This will fail if any NULL values exist. Backfill data first, then add constraint.",
       :alter_only},
      {"add\\s+:[\\w]+,\\s*:[^,]+,\\s*null:\\s*false(?!.*default:)", :high,
       "Adding NOT NULL column without default",
       "New NOT NULL columns on existing tables need a default value.", :alter_only},
      {"create\\s+index(?!.*concurrently)", :high, "CREATE INDEX without CONCURRENTLY",
       "This will lock writes. Use create index(:table, [:cols], concurrently: true).", :any},
      {"execute\\s*\\(?[\"'](?!CREATE INDEX CONCURRENTLY).*UPDATE.*WHERE", :high,
       "Large UPDATE in raw SQL", "Large updates can lock tables. Consider batching.", :any},
      {"execute\\s*\\(?[\"'].*ALTER\\s+TABLE.*ADD\\s+CONSTRAINT.*FOREIGN\\s+KEY", :medium,
       "Adding FOREIGN KEY constraint",
       "This validates all existing rows and can lock the table. Consider NOT VALID first.",
       :any},
      {"add\\s+:[\\w]+,\\s*references\\(", :low, "Adding foreign key",
       "Foreign keys are validated on creation. On large tables, consider adding constraint separately with NOT VALID.",
       :alter_only}
    ]
  end

  defp convention_patterns do
    [
      {"timestamps\\(\\)(?!.*type:\\s*:utc_datetime)", :medium, "timestamps() without type",
       "Use timestamps(type: :utc_datetime) for consistency.", :any},
      {"references\\((?![^)]*on_delete:)[^)]+\\)", :low, "Foreign key without on_delete",
       "Consider specifying on_delete behavior (e.g., :delete_all, :nilify_all, :restrict).",
       :any}
    ]
  end

  @impl Mix.Task
  def run(args) do
    {opts, _, _} =
      OptionParser.parse(args,
        strict: [
          pending: :boolean,
          file: :string,
          verbose: :boolean,
          after: :string,
          all: :boolean
        ]
      )

    migrations_path =
      ["apps/stabileo_repo/priv/repo/migrations", "priv/repo/migrations"]
      |> Enum.map(&Path.expand/1)
      |> Enum.find(&File.dir?/1)

    if is_nil(migrations_path) do
      Mix.shell().error("Could not find migrations directory.")
      stop_with_code(1)
    end

    after_version = cutoff_version(opts)

    files =
      cond do
        opts[:file] ->
          [opts[:file]]

        opts[:pending] ->
          get_pending_migrations(migrations_path)

        true ->
          get_all_migrations(migrations_path)
      end
      |> filter_after_version(after_version)

    if Enum.empty?(files) do
      Mix.shell().info([:green, "No migrations to check."])
      stop_with_code(0)
    else
      Mix.shell().info("Checking #{length(files)} migration(s) for production safety...\n")

      results =
        files
        |> Enum.map(&check_file/1)
        |> Enum.reject(&(&1.issues == []))

      print_results(results, opts[:verbose])
      exit_with_status(results)
    end
  end

  defp get_all_migrations(path) do
    path
    |> Path.join("*.exs")
    |> Path.wildcard()
    |> Enum.sort()
  end

  defp cutoff_version(opts) do
    cond do
      opts[:all] -> 0
      opts[:after] -> String.to_integer(opts[:after])
      opts[:file] -> 0
      true -> @baseline_version
    end
  end

  defp filter_after_version(files, after_version) do
    Enum.filter(files, fn file ->
      version = extract_version(file)
      version > after_version
    end)
  end

  defp extract_version(file) do
    file
    |> Path.basename()
    |> String.split("_")
    |> List.first()
    |> String.to_integer()
  end

  defp get_pending_migrations(path) do
    all = get_all_migrations(path)

    case get_migrated_versions() do
      {:ok, migrated} ->
        Enum.reject(all, fn file ->
          extract_version(file) in migrated
        end)

      :error ->
        Mix.shell().info([:yellow, "Could not connect to database, checking all migrations.\n"])
        all
    end
  end

  defp get_migrated_versions do
    try do
      {:ok, _} = Application.ensure_all_started(:postgrex)
      {:ok, _} = Application.ensure_all_started(:ecto_sql)

      repo = StabileoRepo.Repo

      unless Process.whereis(repo) do
        {:ok, _} = repo.start_link()
      end

      versions =
        Ecto.Migrator.migrated_versions(repo)
        |> MapSet.new()

      {:ok, versions}
    rescue
      _ -> :error
    end
  end

  defp check_file(file) do
    content = File.read!(file)
    basename = Path.basename(file)
    create_table_lines = find_create_table_lines(content)

    all_patterns = dangerous_patterns() ++ convention_patterns()

    issues =
      Enum.flat_map(all_patterns, fn {pattern_str, severity, name, suggestion, context} ->
        pattern = Regex.compile!(pattern_str, [:caseless, :multiline])
        lines = find_matching_lines(content, pattern, context, create_table_lines)

        if lines != [] do
          [%{severity: severity, name: name, suggestion: suggestion, lines: lines}]
        else
          []
        end
      end)

    %{file: basename, path: file, issues: issues}
  end

  defp find_matching_lines(content, pattern, context, create_table_lines) do
    content
    |> String.split("\n")
    |> Enum.with_index(1)
    |> Enum.filter(fn {line, num} ->
      Regex.match?(pattern, line) and
        not String.contains?(line, "# safety:skip") and
        (context == :any or not MapSet.member?(create_table_lines, num))
    end)
    |> Enum.map(fn {_line, num} -> num end)
    |> Enum.take(3)
  end

  defp find_create_table_lines(content) do
    lines = String.split(content, "\n")

    {result, _} =
      Enum.reduce(Enum.with_index(lines, 1), {MapSet.new(), false}, fn
        {line, num}, {set, inside} ->
          trimmed = String.trim(line)

          cond do
            not inside and Regex.match?(~r/create\s+table/i, trimmed) ->
              {MapSet.put(set, num), true}

            inside and trimmed == "end" ->
              {set, false}

            inside ->
              {MapSet.put(set, num), true}

            true ->
              {set, false}
          end
      end)

    result
  end

  defp print_results([], _verbose) do
    Mix.shell().info([:green, "✓ All migrations passed production safety checks!"])
  end

  defp print_results(results, verbose) do
    Mix.shell().info([:red, "Production safety issues found:\n"])

    Enum.each(results, fn %{file: file, issues: issues} ->
      Mix.shell().info([:cyan, "#{file}"])
      Enum.each(issues, &print_issue(&1, verbose))
      Mix.shell().info("")
    end)

    total_issues = results |> Enum.map(& &1.issues) |> List.flatten() |> length()
    critical = count_by_severity(results, :critical)
    high = count_by_severity(results, :high)
    medium = count_by_severity(results, :medium)
    low = count_by_severity(results, :low)

    Mix.shell().info([
      "Found ",
      :red,
      "#{total_issues} issue(s)",
      :reset,
      " in #{length(results)} file(s): ",
      :red,
      "#{critical} critical",
      :reset,
      ", ",
      :yellow,
      "#{high} high",
      :reset,
      ", ",
      :cyan,
      "#{medium} medium",
      :reset,
      ", ",
      :light_black,
      "#{low} low"
    ])

    Mix.shell().info([:light_black, "\nRun with --verbose for suggestions."])
  end

  defp print_issue(issue, verbose) do
    color = severity_color(issue.severity)
    icon = severity_icon(issue.severity)
    lines_info = if issue.lines != [], do: " (line #{Enum.join(issue.lines, ", ")})", else: ""

    Mix.shell().info([color, "  #{icon} [#{issue.severity}] #{issue.name}#{lines_info}"])

    if verbose do
      Mix.shell().info([:light_black, "     └─ #{issue.suggestion}"])
    end
  end

  defp count_by_severity(results, severity) do
    results
    |> Enum.flat_map(& &1.issues)
    |> Enum.count(&(&1.severity == severity))
  end

  defp severity_color(:critical), do: :red
  defp severity_color(:high), do: :yellow
  defp severity_color(:medium), do: :cyan
  defp severity_color(:low), do: :light_black

  defp severity_icon(:critical), do: "✗"
  defp severity_icon(:high), do: "!"
  defp severity_icon(:medium), do: "○"
  defp severity_icon(:low), do: "·"

  defp exit_with_status(results) do
    has_critical_or_high =
      results
      |> Enum.flat_map(& &1.issues)
      |> Enum.any?(&(&1.severity in [:critical, :high]))

    if has_critical_or_high do
      stop_with_code(1)
    else
      stop_with_code(0)
    end
  end

  # System.stop/1 under `mix test` overwrites the suite's exit code.
  @mix_env Mix.env()
  defp stop_with_code(code) do
    if @mix_env != :test, do: System.stop(code), else: :ok
  end
end
