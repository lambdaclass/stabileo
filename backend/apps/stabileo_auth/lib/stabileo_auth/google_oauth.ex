defmodule StabileoAuth.GoogleOAuth do
  @moduledoc """
  Google sign-in through Assent's OpenID Connect strategy. The strategy module
  comes from `config :stabileo_auth, :google_strategy`, so tests swap Google
  for a stub.
  """

  def configured? do
    config = Application.get_env(:stabileo_auth, :google_oauth, [])
    present?(config[:client_id]) and present?(config[:client_secret])
  end

  def authorize_url do
    strategy().authorize_url(config())
  end

  @doc "Exchanges the callback params for the user's normalized claims."
  def callback(params, session_params) do
    case strategy().callback(config() ++ [session_params: session_params], params) do
      {:ok, %{user: user}} -> {:ok, user}
      {:error, _reason} -> {:error, :callback_failed}
    end
  end

  defp config do
    oauth = Application.get_env(:stabileo_auth, :google_oauth, [])

    [
      client_id: oauth[:client_id],
      client_secret: oauth[:client_secret],
      redirect_uri: oauth[:redirect_uri]
    ]
  end

  defp strategy, do: Application.get_env(:stabileo_auth, :google_strategy, Assent.Strategy.Google)

  defp present?(value), do: is_binary(value) and value != ""
end
