defmodule StabileoRepo.DataCase do
  @moduledoc """
  Test case for tests that touch the database: checks out a sandbox connection
  per test and imports `errors_on/1`.
  """

  use ExUnit.CaseTemplate

  alias Ecto.Adapters.SQL.Sandbox

  using do
    quote do
      alias StabileoRepo.Repo

      import Ecto
      import Ecto.Changeset
      import Ecto.Query
      import StabileoRepo.DataCase
    end
  end

  setup tags do
    StabileoRepo.DataCase.setup_sandbox(tags)
    :ok
  end

  def setup_sandbox(tags) do
    pid = Sandbox.start_owner!(StabileoRepo.Repo, shared: not tags[:async])

    on_exit(fn ->
      Sandbox.stop_owner(pid)
    end)
  end

  @doc "Transforms changeset errors into a map of messages."
  def errors_on(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {message, opts} ->
      Regex.replace(~r"%{(\w+)}", message, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end
end
