defmodule StabileoUtils.Controller do
  @moduledoc """
  What every JSON controller in the umbrella uses instead of reaching for
  `use Phoenix.Controller` directly, so cross-cutting controller plugs are
  mounted in one place. `StabileoUtils.ControllerConventionTest` fails the build
  if a controller bypasses it.
  """

  defmacro __using__(_opts) do
    quote do
      use Phoenix.Controller, formats: [:json]
    end
  end
end
