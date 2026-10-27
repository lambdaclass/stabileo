defmodule StabileoAuth.Controllers.ConsentController do
  use StabileoUtils.Controller

  action_fallback(StabileoUtils.FallbackController)

  alias StabileoAuth.{AccountJSON, Consents}

  @doc """
  Records one decision of the signed-in account: `{"kind": "terms"}` accepts
  the terms in force; `usage_analytics` and `model_research` take `granted`.
  Answers the account with its consents, as `GET /me` does.
  """
  def create(conn, %{"kind" => kind} = params) do
    account = conn.assigns.current_account
    granted = if kind == "terms", do: true, else: params["granted"]

    with :ok <- boolean(granted),
         {:ok, _consent} <- Consents.record(account, kind, granted, metadata(conn)) do
      conn
      |> put_status(:created)
      |> json(%{data: AccountJSON.render_with_consents(account)})
    end
  end

  def create(_conn, _params), do: {:error, {:validation, %{kind: ["can't be blank"]}}}

  defp boolean(value) when is_boolean(value), do: :ok
  defp boolean(_value), do: {:error, {:validation, %{granted: ["must be true or false"]}}}

  defp metadata(conn) do
    %{ip_address: conn.assigns[:client_ip], user_agent: conn.assigns[:user_agent]}
  end
end
