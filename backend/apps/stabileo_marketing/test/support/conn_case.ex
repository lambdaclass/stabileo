defmodule StabileoMarketing.ConnCase do
  @moduledoc "Controller and context tests for `stabileo_marketing`, with a sandboxed repo and Oban in manual mode."

  use ExUnit.CaseTemplate

  alias Ecto.Adapters.SQL.Sandbox

  using do
    quote do
      use Oban.Testing, repo: StabileoRepo.Repo, prefix: "public"

      import Plug.Conn
      import Ecto.Query
      import StabileoMarketing.ConnCase

      alias StabileoMarketing.HttpStub
      alias StabileoRepo.{Factory, Repo}
    end
  end

  setup tags do
    pid = Sandbox.start_owner!(StabileoRepo.Repo, shared: not tags[:async])
    on_exit(fn -> Sandbox.stop_owner(pid) end)
    {:ok, _} = StabileoRepo.Features.set_user_login_enabled(true)
    StabileoMarketing.HttpStub.stub([])
    :ok
  end

  @router_opts StabileoMarketing.Router.init([])
  @admin_router_opts StabileoMarketing.AdminRouter.init([])

  def request(method, path, params \\ %{}, token \\ nil),
    do: call(StabileoMarketing.Router, @router_opts, method, path, params, token)

  def admin_request(method, path, params \\ %{}, token \\ nil),
    do: call(StabileoMarketing.AdminRouter, @admin_router_opts, method, path, params, token)

  defp call(router, opts, method, path, params, token) do
    conn =
      method
      |> Plug.Test.conn(path, params)
      |> Plug.Conn.put_req_header("accept", "application/json")
      |> Plug.Conn.put_req_header("user-agent", "conn-case")

    conn = if token, do: Plug.Conn.put_req_header(conn, "authorization", "Bearer #{token}"), else: conn
    router.call(conn, opts)
  end

  def json_body(conn, status) do
    assert conn.status == status, "expected #{status}, got #{conn.status}: #{conn.resp_body}"
    Jason.decode!(conn.resp_body)
  end

  def log_in(account), do: elem(StabileoAuth.login(account.email, StabileoRepo.Factory.password()), 1).access_token

  def admin_log_in(account),
    do: elem(StabileoAuth.Admin.login(account.email, StabileoRepo.Factory.password()), 1).access_token

  def configure(attrs) do
    {:ok, config} = StabileoMarketing.Configs.update(attrs)
    config
  end
end
