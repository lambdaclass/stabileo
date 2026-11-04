defmodule StabileoAuth.Controllers.Admin.OAuthController do
  use StabileoUtils.Controller

  import Plug.Conn

  alias StabileoAuth.{AdminOAuth, GoogleOAuth}

  @session_key :admin_oauth_session_params

  def request(conn, _params) do
    with true <- GoogleOAuth.configured?(),
         {:ok, %{url: url, session_params: session_params}} <- GoogleOAuth.authorize_url() do
      conn
      |> put_session(@session_key, session_params)
      |> redirect(external: url)
    else
      _ -> to_admin(conn, oauth_error: "oauth_unavailable")
    end
  end

  def callback(conn, params) do
    session_params = get_session(conn, @session_key)
    conn = delete_session(conn, @session_key)

    cond do
      Map.has_key?(params, "error") ->
        to_admin(conn, oauth_error: "provider_error")

      is_nil(session_params) ->
        to_admin(conn, oauth_error: "invalid_state")

      true ->
        with {:ok, user} <- GoogleOAuth.callback(params, session_params),
             {:ok, code} <- AdminOAuth.sign_in(user, metadata(conn)) do
          to_admin(conn, code: code)
        else
          {:error, reason} -> to_admin(conn, oauth_error: oauth_error(reason))
        end
    end
  end

  def exchange(conn, params) do
    case AdminOAuth.exchange(params["code"], metadata(conn)) do
      {:ok, payload} ->
        json(conn, payload)

      {:error, _reason} ->
        conn
        |> put_status(:unauthorized)
        |> json(%{
          error: "invalid_or_expired_code",
          message: "The sign-in link expired. Try again."
        })
    end
  end

  @oauth_errors ~w(callback_failed email_not_verified domain_not_allowed email_not_allowed account_disabled)a

  defp oauth_error(reason) when reason in @oauth_errors, do: Atom.to_string(reason)
  defp oauth_error(_reason), do: "callback_failed"

  defp to_admin(conn, query) do
    base = Application.get_env(:stabileo_auth, :admin_frontend_url, "http://localhost:4001")
    redirect(conn, external: "#{base}/oauth/callback?#{URI.encode_query(query)}")
  end

  defp metadata(conn) do
    %{ip_address: conn.assigns[:client_ip], user_agent: conn.assigns[:user_agent]}
  end
end
