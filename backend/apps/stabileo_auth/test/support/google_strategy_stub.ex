defmodule StabileoAuth.GoogleStrategyStub do
  @moduledoc """
  Stands in for `Assent.Strategy.Google` in tests. The callback answers the
  user stored with `put_user/1` when the state matches, as Google would.
  """

  def put_user(user), do: Application.put_env(:stabileo_auth, :google_stub_user, user)

  def authorize_url(config) do
    {:ok,
     %{
       url:
         "https://accounts.google.test/o/oauth2/auth?client_id=#{config[:client_id]}&state=stub-state",
       session_params: %{state: "stub-state"}
     }}
  end

  def callback(config, %{"state" => state, "code" => _code}) do
    case config[:session_params] do
      %{state: ^state} ->
        case Application.get_env(:stabileo_auth, :google_stub_user) do
          nil -> {:error, :no_user}
          user -> {:ok, %{user: user, token: %{}}}
        end

      _ ->
        {:error, :state_mismatch}
    end
  end

  def callback(_config, _params), do: {:error, :missing_params}
end
