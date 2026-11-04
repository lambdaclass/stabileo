defmodule StabileoRepo.DemoPassword do
  @moduledoc """
  The shared password for seeded demo accounts.

  Single source of truth on the Elixir side. The credentials table in the root
  `CLAUDE.md` cannot read it, so a rotation updates that table by hand.
  """

  def value, do: "stabileo-demo-password"
end
