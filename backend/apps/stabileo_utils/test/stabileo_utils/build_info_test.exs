defmodule StabileoUtils.BuildInfoTest do
  use ExUnit.Case, async: false

  alias StabileoUtils.BuildInfo

  setup do
    commit = System.get_env("GIT_COMMIT_SHA")
    env = System.get_env("DEPLOY_ENV")

    on_exit(fn ->
      restore("GIT_COMMIT_SHA", commit)
      restore("DEPLOY_ENV", env)
    end)

    :ok
  end

  defp restore(name, nil), do: System.delete_env(name)
  defp restore(name, value), do: System.put_env(name, value)

  describe "version/0" do
    test "is the application version with a v prefix" do
      assert BuildInfo.version() == "v" <> StabileoUtils.version()
    end
  end

  describe "commit/0" do
    test "GIT_COMMIT_SHA overrides the compile-time commit" do
      System.put_env("GIT_COMMIT_SHA", "abc1234")
      assert BuildInfo.commit() == "abc1234"
    end

    test "a blank GIT_COMMIT_SHA falls back to the compile-time commit" do
      System.put_env("GIT_COMMIT_SHA", "")
      fallback = BuildInfo.commit()

      assert is_binary(fallback)
      refute fallback == ""
    end
  end

  describe "environment/0" do
    test "DEPLOY_ENV overrides the compile-time Mix env" do
      System.put_env("DEPLOY_ENV", "staging")
      assert BuildInfo.environment() == "staging"
    end

    test "falls back to the Mix env the build was compiled in" do
      System.delete_env("DEPLOY_ENV")
      assert BuildInfo.environment() == "test"
    end
  end
end
