defmodule StabileoAuth.GoogleOAuth do
  @moduledoc """
  Google sign-in through Assent's OpenID Connect strategy. The strategy module
  comes from `config :stabileo_auth, :google_strategy`, so tests swap Google
  for a stub and local development for `StabileoAuth.DevGoogle`.

  Two OAuth clients: the admin site's (`:admin`, `client_id`, called back on
  the admin host) and the product's (`:app`, `app_client_id`, called back on
  the product host, where the browser started the sign-in and holds its state
  cookie). `:app_google_strategy` overrides the strategy for the product.
  """

  def configured? do
    config = Application.get_env(:stabileo_auth, :google_oauth, [])
    present?(config[:client_id]) and present?(config[:client_secret])
  end

  def app_configured? do
    oauth = Application.get_env(:stabileo_auth, :google_oauth, [])

    present?(oauth[:app_client_id]) and present?(oauth[:app_client_secret]) and
      present?(oauth[:app_redirect_uri]) and present?(app_frontend_url())
  end

  def app_frontend_url, do: Application.get_env(:stabileo_auth, :app_frontend_url)

  def authorize_url(kind \\ :admin) do
    strategy(kind).authorize_url(config(kind))
  end

  @doc "Exchanges the callback params for the user's normalized claims."
  def callback(params, session_params, kind \\ :admin) do
    case strategy(kind).callback(config(kind) ++ [session_params: session_params], params) do
      {:ok, %{user: user}} -> {:ok, user}
      {:error, _reason} -> {:error, :callback_failed}
    end
  end

  defp config(:app) do
    oauth = Application.get_env(:stabileo_auth, :google_oauth, [])

    [
      client_id: oauth[:app_client_id],
      client_secret: oauth[:app_client_secret],
      redirect_uri: oauth[:app_redirect_uri]
    ]
  end

  defp config(_admin) do
    oauth = Application.get_env(:stabileo_auth, :google_oauth, [])

    [
      client_id: oauth[:client_id],
      client_secret: oauth[:client_secret],
      redirect_uri: oauth[:redirect_uri]
    ]
  end

  defp strategy(:app),
    do: Application.get_env(:stabileo_auth, :app_google_strategy) || strategy(:admin)

  defp strategy(_admin),
    do: Application.get_env(:stabileo_auth, :google_strategy, Assent.Strategy.Google)

  defp present?(value), do: is_binary(value) and value != ""
end
