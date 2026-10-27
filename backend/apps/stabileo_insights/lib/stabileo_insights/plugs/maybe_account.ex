defmodule StabileoInsights.Plugs.MaybeAccount do
  @moduledoc """
  Assigns `current_account` when the request carries a valid product access
  token, and lets it through untouched otherwise: feedback may come from
  anyone, and is tied to the sender only when they are signed in.
  """

  import Plug.Conn

  alias StabileoAuth.{Accounts, Tokens}
  alias StabileoRepo.Schemas.Account

  def init(opts), do: opts

  def call(conn, _opts) do
    with ["Bearer " <> token] <- get_req_header(conn, "authorization"),
         {:ok, %{"app" => "app", "sub" => sub}} <- Tokens.verify_access_token(token),
         %Account{is_active: true} = account <- Accounts.get_account(sub) do
      assign(conn, :current_account, account)
    else
      _ -> conn
    end
  end
end
