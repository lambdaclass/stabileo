defmodule StabileoAuth.GoogleOAuth do
  @moduledoc """
  Google sign-in through Assent's OpenID Connect strategy. The strategy module
  comes from `config :stabileo_auth, :google_strategy`, so tests swap Google
  for a stub and local development for `StabileoAuth.DevGoogle`.

  Two callbacks share the client: the admin site's (`:admin`, on the admin
  host) and the product's (`:app`, on the product host, where the browser
  started the sign-in and holds its state cookie).
  """

  def configured? do
    config = Application.get_env(:stabileo_auth, :google_oauth, [])
    present?(config[:client_id]) and present?(config[:client_secret])
  end

  @doc "Configured, and the product's callback and site are known."
  def app_configured? do
    oauth = Application.get_env(:stabileo_auth, :google_oauth, [])
    configured?() and present?(oauth[:app_redirect_uri]) and present?(app_frontend_url())
  end

  def app_frontend_url, do: Application.get_env(:stabileo_auth, :app_frontend_url)

  def authorize_url(kind \\ :admin) do
    strategy().authorize_url(config(kind))
  end

  @doc "Exchanges the callback params for the user's normalized claims."
  def callback(params, session_params, kind \\ :admin) do
    case strategy().callback(config(kind) ++ [session_params: session_params], params) do
      {:ok, %{user: user}} -> {:ok, user}
      {:error, _reason} -> {:error, :callback_failed}
    end
  end

  defp config(kind) do
    oauth = Application.get_env(:stabileo_auth, :google_oauth, [])

    [
      client_id: oauth[:client_id],
      client_secret: oauth[:client_secret],
      redirect_uri: if(kind == :app, do: oauth[:app_redirect_uri], else: oauth[:redirect_uri])
    ]
  end

  defp strategy, do: Application.get_env(:stabileo_auth, :google_strategy, Assent.Strategy.Google)

  defp present?(value), do: is_binary(value) and value != ""
end
