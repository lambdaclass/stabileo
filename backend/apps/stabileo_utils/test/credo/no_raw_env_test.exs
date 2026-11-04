Code.require_file("../../../../.credo/checks/no_raw_env.ex", __DIR__)

defmodule StabileoCredo.Checks.NoRawEnvTest do
  use Credo.Test.Case

  alias StabileoCredo.Checks.NoRawEnv

  setup_all do
    {:ok, _} = Application.ensure_all_started(:credo)
    :ok
  end

  @runtime "config/runtime.exs"
  @lib "apps/stabileo_projects/lib/stabileo_projects/thing.ex"

  describe "flags raw env reads in runtime code" do
    test "System.get_env" do
      ~S"""
      x = System.get_env("FOO")
      """
      |> to_source_file(@runtime)
      |> run_check(NoRawEnv)
      |> assert_issue()
    end

    test "System.fetch_env" do
      ~S"""
      defmodule Foo do
        def go, do: System.fetch_env("FOO")
      end
      """
      |> to_source_file(@lib)
      |> run_check(NoRawEnv)
      |> assert_issue()
    end

    test "System.fetch_env!" do
      ~S"""
      defmodule Foo do
        def go, do: System.fetch_env!("FOO")
      end
      """
      |> to_source_file(@lib)
      |> run_check(NoRawEnv)
      |> assert_issue()
    end

    test ":os.getenv" do
      ~S"""
      x = :os.getenv(~c"FOO")
      """
      |> to_source_file(@runtime)
      |> run_check(NoRawEnv)
      |> assert_issue()
    end

    test "import System (which would let a bare get_env bypass the guard)" do
      ~S"""
      defmodule Foo do
        import System
        def go, do: get_env("FOO")
      end
      """
      |> to_source_file(@lib)
      |> run_check(NoRawEnv)
      |> assert_issue()
    end

    test "alias System, as: Env" do
      ~S"""
      defmodule Foo do
        alias System, as: Env
        def go, do: Env.get_env("FOO")
      end
      """
      |> to_source_file(@lib)
      |> run_check(NoRawEnv)
      |> assert_issue()
    end
  end

  describe "allows the sanctioned helper and exempt paths" do
    test "StabileoUtils.fetch_env / fetch_env! are fine" do
      ~S"""
      x = StabileoUtils.fetch_env("FOO")
      y = StabileoUtils.fetch_env!("BAR")
      """
      |> to_source_file(@runtime)
      |> run_check(NoRawEnv)
      |> refute_issues()
    end

    test "compile-time config (config/dev.exs) is exempt" do
      ~S"""
      x = System.get_env("FOO")
      """
      |> to_source_file("config/dev.exs")
      |> run_check(NoRawEnv)
      |> refute_issues()
    end

    test "test support is exempt" do
      ~S"""
      x = System.get_env("FOO")
      """
      |> to_source_file("apps/stabileo_projects/test/support/foo.ex")
      |> run_check(NoRawEnv)
      |> refute_issues()
    end

    test "the helper module itself is exempt" do
      ~S"""
      defmodule StabileoUtils do
        def fetch_env!(name), do: System.get_env(name) || raise("missing")
      end
      """
      |> to_source_file("apps/stabileo_utils/lib/stabileo_utils.ex")
      |> run_check(NoRawEnv)
      |> refute_issues()
    end
  end
end
