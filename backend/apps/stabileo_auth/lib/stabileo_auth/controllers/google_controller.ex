defmodule StabileoAuth.Controllers.GoogleController do
  @moduledoc false

  use StabileoUtils.Controller

  import Plug.Conn

  alias StabileoAuth.{DevGoogle, GoogleOAuth, UserOAuth}

  action_fallback(StabileoUtils.FallbackController)

  @session_key :user_oauth_session_params
  @attempt_key :user_oauth_attempt
  @register_fields ~w(locale accept_terms usage_analytics model_research)

  def request(conn, params) do
    attempt = params["attempt"]

    with true <- UserOAuth.valid_attempt?(attempt) || :invalid_state,
         true <- GoogleOAuth.app_configured?(),
         {:ok, %{url: url, session_params: session_params}} <- GoogleOAuth.authorize_url(:app) do
      conn
      |> put_session(@session_key, session_params)
      |> put_session(@attempt_key, attempt)
      |> redirect(external: url)
    else
      :invalid_state -> to_app(conn, nil, error: "invalid_state")
      _ -> to_app(conn, attempt, error: "oauth_unavailable")
    end
  end

  def callback(conn, params) do
    session_params = get_session(conn, @session_key)
    attempt = get_session(conn, @attempt_key)
    conn = conn |> delete_session(@session_key) |> delete_session(@attempt_key)

    cond do
      Map.has_key?(params, "error") ->
        to_app(conn, attempt, error: "provider_error")

      is_nil(session_params) or not UserOAuth.valid_attempt?(attempt) ->
        to_app(conn, attempt, error: "invalid_state")

      true ->
        with {:ok, user} <- GoogleOAuth.callback(params, session_params, :app),
             {:ok, code} <- UserOAuth.sign_in(user, attempt, metadata(conn)) do
          to_app(conn, attempt, code: code)
        else
          {:error, reason} -> to_app(conn, attempt, error: oauth_error(reason))
        end
    end
  end

  def dev(conn, %{"state" => state, "redirect_uri" => redirect_uri}) do
    if DevGoogle.enabled?() and DevGoogle.configured_redirect?(redirect_uri) do
      conn
      |> put_resp_content_type("text/html")
      |> send_resp(200, DevGoogle.page(state, redirect_uri))
    else
      {:error, :not_found}
    end
  end

  def dev(_conn, _params), do: {:error, :not_found}

  def exchange(conn, params) do
    case UserOAuth.exchange(params["code"], params["verifier"], metadata(conn)) do
      {:ok, payload} -> json(conn, payload)
      {:error, _reason} -> expired(conn)
    end
  end

  def register(conn, params) do
    case UserOAuth.register(
           params["signup_token"],
           Map.take(params, @register_fields),
           metadata(conn)
         ) do
      {:ok, payload} -> conn |> put_status(:created) |> json(payload)
      {:error, :invalid_or_expired_code} -> expired(conn)
      {:error, reason} -> {:error, reason}
    end
  end

  defp expired(conn) do
    conn
    |> put_status(:unauthorized)
    |> json(%{error: "invalid_or_expired_code", message: "The sign-in expired. Try again."})
  end

  @oauth_errors ~w(callback_failed email_not_verified email_in_use invalid_state account_disabled user_login_disabled)a

  defp oauth_error(reason) when reason in @oauth_errors, do: Atom.to_string(reason)
  defp oauth_error(_reason), do: "callback_failed"

  defp to_app(conn, attempt, query) do
    query = if UserOAuth.valid_attempt?(attempt), do: query ++ [attempt: attempt], else: query
    base = GoogleOAuth.app_frontend_url() || ""
    redirect(conn, external: "#{base}/oauth-callback.html?#{URI.encode_query(query)}")
  end

  defp metadata(conn) do
    %{ip_address: conn.assigns[:client_ip], user_agent: conn.assigns[:user_agent]}
  end
end
