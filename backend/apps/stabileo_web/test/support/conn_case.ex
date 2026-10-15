defmodule StabileoWeb.ConnCase do
  @moduledoc "Tests that go through the whole `StabileoWeb.Endpoint`."

  use ExUnit.CaseTemplate

  alias Ecto.Adapters.SQL.Sandbox

  using do
    quote do
      import Plug.Conn
      import Phoenix.ConnTest

      @endpoint StabileoWeb.Endpoint
    end
  end

  setup tags do
    pid = Sandbox.start_owner!(StabileoRepo.Repo, shared: not tags[:async])
    on_exit(fn -> Sandbox.stop_owner(pid) end)
    {:ok, conn: Phoenix.ConnTest.build_conn()}
  end
end
