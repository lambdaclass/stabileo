defmodule StabileoCredo.Checks.NoRawEnv do
  use Credo.Check,
    id: "STB001",
    base_priority: :high,
    category: :warning,
    explanations: [
      check: """
      Read environment variables through `StabileoUtils.fetch_env!/2` (required —
      raises on a missing or blank value) or `StabileoUtils.fetch_env/2` (optional —
      falls back to a default), never `System.get_env`, `System.fetch_env`,
      `System.fetch_env!`, or `:os.getenv` directly.

      On the deploy path every variable is written to `.env` unconditionally, so
      an unset var arrives as a blank `""` rather than `nil`. A raw read treats
      that blank as a set value and silently misconfigures the app; the helpers
      reject it. See `config/runtime.exs`.

      `import System` and `alias System` are flagged too: otherwise
      `import System; get_env("FOO")` or `alias System, as: Env; Env.get_env("FOO")`
      would slip a raw read past the literal-call match. (`:os` can't be imported
      in Elixir, so `:os.getenv` only appears qualified.)
      """
    ]

  @banned_system [:get_env, :fetch_env, :fetch_env!]
  @system_aliases [[:System], [:"Elixir", :System]]

  @impl true
  def run(%SourceFile{} = source_file, params) do
    if scan?(source_file.filename) do
      ctx = Context.build(source_file, params, __MODULE__)
      Credo.Code.prewalk(source_file, &walk/2, ctx).issues
    else
      []
    end
  end

  defp walk({{:., _, [{:__aliases__, meta, [:"Elixir", :System]}, fun]}, _, _args} = ast, ctx)
       when fun in @banned_system do
    {ast, put_issue(ctx, read_issue(ctx, meta, "System.#{fun}"))}
  end

  defp walk({{:., _, [{:__aliases__, meta, [:System]}, fun]}, _, _args} = ast, ctx)
       when fun in @banned_system do
    {ast, put_issue(ctx, read_issue(ctx, meta, "System.#{fun}"))}
  end

  defp walk({{:., meta, [:os, :getenv]}, _, _args} = ast, ctx) do
    {ast, put_issue(ctx, read_issue(ctx, Keyword.delete(meta, :column), ":os.getenv"))}
  end

  defp walk({directive, meta, [{:__aliases__, _, aliases} | _]} = ast, ctx)
       when directive in [:import, :alias] and aliases in @system_aliases do
    {ast, put_issue(ctx, bypass_issue(ctx, meta, "#{directive} System"))}
  end

  defp walk(ast, ctx), do: {ast, ctx}

  defp read_issue(ctx, meta, trigger) do
    format_issue(
      ctx,
      message:
        "Read env vars through StabileoUtils.fetch_env!/2 or fetch_env/2, not #{trigger} " <>
          ~s(— a raw read treats a blank "" as a set value.),
      trigger: trigger,
      line_no: meta[:line],
      column: meta[:column]
    )
  end

  defp bypass_issue(ctx, meta, trigger) do
    format_issue(
      ctx,
      message:
        "Don't #{trigger} in env-reading code — read env vars through " <>
          "StabileoUtils.fetch_env!/2 or fetch_env/2 so a raw read can't bypass this guard.",
      trigger: trigger,
      line_no: meta[:line],
      column: meta[:column]
    )
  end

  defp scan?(filename) do
    cond do
      String.ends_with?(filename, "apps/stabileo_utils/lib/stabileo_utils.ex") -> false
      String.contains?(filename, "/test/") -> false
      String.ends_with?(filename, "config/runtime.exs") -> true
      String.contains?(filename, "/lib/") -> true
      true -> false
    end
  end
end
