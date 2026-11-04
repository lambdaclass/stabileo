defmodule StabileoUtils.BuildInfo do
  @moduledoc """
  Version/commit/environment identity of the running build.

  VERSION and the git sha are captured at compile time; `GIT_COMMIT_SHA`
  and `DEPLOY_ENV` override at runtime — the deploy pipeline sets them
  because releases are built from a tarball where `.git` is absent.
  """

  @external_resource version_file = Path.join([__DIR__, "..", "..", "..", "..", "..", "VERSION"])
  @version (case File.read(version_file) do
              {:ok, content} -> String.trim(content)
              {:error, _} -> "unknown"
            end)

  @compile_time_commit (case System.cmd("git", ["rev-parse", "--short", "HEAD"],
                               stderr_to_stdout: true
                             ) do
                          {commit, 0} -> String.trim(commit)
                          _ -> "unknown"
                        end)

  @compile_time_env to_string(Mix.env())

  def version, do: "v#{@version}"

  def commit, do: StabileoUtils.fetch_env("GIT_COMMIT_SHA", @compile_time_commit)

  def environment, do: StabileoUtils.fetch_env("DEPLOY_ENV", @compile_time_env)
end
