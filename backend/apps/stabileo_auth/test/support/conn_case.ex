defmodule StabileoAuth.ConnCase do
  @moduledoc """
  Controller tests against `StabileoAuth.Router`, with a sandboxed repo.
  """

  use ExUnit.CaseTemplate

  alias Ecto.Adapters.SQL.Sandbox

  using do
    quote do
      import Plug.Conn
      import StabileoAuth.ConnCase

      alias StabileoRepo.{Factory, Repo}
    end
  end

  setup tags do
    pid = Sandbox.start_owner!(StabileoRepo.Repo, shared: not tags[:async])
    on_exit(fn -> Sandbox.stop_owner(pid) end)

    unless tags[:user_login] == false,
      do: {:ok, _} = StabileoRepo.Features.set_user_login_enabled(true)

    :ok
  end

  @router_opts StabileoAuth.Router.init([])
  @admin_router_opts StabileoAuth.AdminRouter.init([])

  def request(method, path, params \\ %{}, token \\ nil) do
    call(StabileoAuth.Router, @router_opts, method, path, params, token)
  end

  def admin_request(method, path, params \\ %{}, token \\ nil) do
    call(StabileoAuth.AdminRouter, @admin_router_opts, method, path, params, token)
  end

  defp call(router, opts, method, path, params, token) do
    conn =
      method
      |> Plug.Test.conn(path, params)
      |> Plug.Conn.put_req_header("accept", "application/json")
      |> Plug.Conn.put_req_header("user-agent", "conn-case")

    conn =
      if token, do: Plug.Conn.put_req_header(conn, "authorization", "Bearer #{token}"), else: conn

    router.call(conn, opts)
  end

  def json_body(conn, status) do
    assert conn.status == status,
           "expected #{status}, got #{conn.status}: #{conn.resp_body}"

    Jason.decode!(conn.resp_body)
  end

  def admin_log_in(account, password \\ StabileoRepo.Factory.password()) do
    {:ok, payload} = StabileoAuth.Admin.login(account.email, password)
    payload
  end

  def log_in(account, password \\ StabileoRepo.Factory.password()) do
    {:ok, payload} = StabileoAuth.login(account.email, password)
    payload
  end
end
