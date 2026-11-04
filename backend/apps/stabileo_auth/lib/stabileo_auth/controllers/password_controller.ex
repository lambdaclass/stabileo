defmodule StabileoAuth.Controllers.PasswordController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoAuth.Accounts

  def update(conn, %{"current_password" => current, "password" => new}) do
    %{current_account: account, current_session_id: session_id} = conn.assigns

    with {:ok, _account} <- Accounts.change_password(account, current, new, session_id) do
      json(conn, %{message: "Password changed"})
    end
  end

  def update(_conn, _params) do
    {:error, {:validation, %{password: ["can't be blank"], current_password: ["can't be blank"]}}}
  end
end
