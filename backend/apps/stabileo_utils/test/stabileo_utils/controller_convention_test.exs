defmodule StabileoUtils.ControllerConventionTest do
  use ExUnit.Case, async: true

  @apps_dir Path.expand("../../..", __DIR__)

  defp controller_sources do
    @apps_dir
    |> Path.join("*/lib/**/*_controller.ex")
    |> Path.wildcard()
  end

  test "every controller goes through StabileoUtils.Controller" do
    offenders =
      controller_sources()
      |> Enum.reject(&(File.read!(&1) =~ ~r/^\s*use StabileoUtils\.Controller\b/m))
      |> Enum.map(&Path.relative_to(&1, @apps_dir))

    assert offenders == [],
           """
           These controllers do not go through StabileoUtils.Controller:

               #{Enum.join(offenders, "\n    ")}

           Add `use StabileoUtils.Controller`. Any other way in skips the
           controller plugs it mounts, with no visible symptom.
           """
  end

  test "the glob actually finds the controllers it is guarding" do
    found = Enum.map(controller_sources(), &Path.relative_to(&1, @apps_dir))

    assert "stabileo_utils/lib/stabileo_utils/fallback_controller.ex" in found
  end
end
