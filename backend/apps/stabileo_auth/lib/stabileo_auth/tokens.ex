defmodule StabileoAuth.Tokens do
  @moduledoc """
  JWT signing and verification. Access tokens are short-lived and stateless;
  refresh tokens are bound to a `sessions` row, which is what makes them
  revocable. Every token carries the `app` it was issued for (`"app"` or
  `"admin"`), and each side refuses the other's.
  """

  use Joken.Config

  alias StabileoRepo.Schemas.{Account, Session}

  def access_token_ttl, do: Application.get_env(:stabileo_auth, :access_token_ttl, 900)

  def refresh_token_ttl(app \\ "app")

  def refresh_token_ttl("admin"),
    do: Application.get_env(:stabileo_auth, :admin_refresh_token_ttl, 14_400)

  def refresh_token_ttl(_app),
    do: Application.get_env(:stabileo_auth, :refresh_token_ttl, 604_800)

  def generate_access_token(%Account{} = account, %Session{} = session, app \\ "app") do
    sign(
      %{"sub" => account.id, "session_id" => session.id, "type" => "access", "app" => app},
      access_token_ttl()
    )
  end

  def generate_refresh_token(%Session{} = session, app \\ "app") do
    sign(
      %{
        "sub" => session.account_id,
        "session_id" => session.id,
        "type" => "refresh",
        "app" => app
      },
      refresh_token_ttl(app)
    )
  end

  def verify_access_token(token), do: verify(token, "access")

  def verify_refresh_token(token), do: verify(token, "refresh")

  defp sign(claims, ttl) do
    case Joken.generate_and_sign(default_claims(default_exp: ttl), claims, signer()) do
      {:ok, token, _claims} -> {:ok, token}
      {:error, reason} -> {:error, reason}
    end
  end

  defp verify(token, type) when is_binary(token) do
    case Joken.verify_and_validate(default_claims(), token, signer()) do
      {:ok, %{"type" => ^type} = claims} -> {:ok, claims}
      {:ok, _claims} -> {:error, :invalid_token_type}
      {:error, _reason} -> {:error, :invalid_token}
    end
  end

  defp verify(_token, _type), do: {:error, :invalid_token}

  defp signer,
    do: Joken.Signer.create("HS256", Application.fetch_env!(:stabileo_auth, :jwt_secret))
end
