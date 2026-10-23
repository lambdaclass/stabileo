defmodule StabileoAuth.AdminOAuth do
  @moduledoc """
  Admin sign-in with Google. The callback checks the Google identity, opens an
  admin session and hands the browser a one-time code; the admin site trades
  the code for tokens, so tokens never travel in a URL.

  Google must report the email verified and its Workspace domain (`hd`) at an
  allowed domain: an allowed email suffix alone could be a personal Google
  account registered with a company address.

  An existing account nobody verified is the owner's only from here on: whoever
  signed it up may not be the owner, so its password and sessions end.
  """

  alias StabileoAuth.{Accounts, AdminAccess, AdminAllowedEmails, Sessions, Tokens}
  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.Account

  @code_ttl 60
  @code_type "admin_oauth_code"

  @doc "Answers `{:ok, code}` or `{:error, oauth_error}` with an atom from the spec."
  def sign_in(%{} = user, metadata \\ %{}) do
    email = user["email"]

    cond do
      not is_binary(email) or email == "" -> {:error, :callback_failed}
      user["email_verified"] != true -> {:error, :email_not_verified}
      not domain_ok?(email, user["hd"]) -> {:error, :domain_not_allowed}
      not AdminAllowedEmails.active?(email) -> {:error, :email_not_allowed}
      true -> open_session(user, metadata)
    end
  end

  def exchange(code, metadata \\ %{}) do
    with {:ok, %{"session_id" => session_id}} <- verify_code(code),
         %{} = session <- Sessions.get_session(session_id),
         :ok <- Sessions.validate_session(session),
         %Account{is_active: true} = account <- Accounts.get_account(session.account_id),
         true <- AdminAccess.admin?(account),
         {:ok, rotated} <-
           Sessions.rotate_session(session, metadata, Tokens.refresh_token_ttl("admin")) do
      StabileoAuth.session_payload(account, rotated, "admin")
    else
      _ -> {:error, :invalid_or_expired_code}
    end
  end

  defp domain_ok?(email, hd) do
    AdminAllowedEmails.domain_allowed?(email) and is_binary(hd) and
      String.downcase(hd) in AdminAllowedEmails.domains() and
      String.ends_with?(String.downcase(email), "@" <> String.downcase(hd))
  end

  defp open_session(user, metadata) do
    with {:ok, account} <- find_or_create(user),
         :ok <- ensure_active(account),
         {:ok, account} <- Accounts.record_sign_in(account),
         {:ok, session} <-
           Sessions.create_session(account, metadata, Tokens.refresh_token_ttl("admin")) do
      {:ok, sign_code(session)}
    end
  end

  defp find_or_create(user) do
    verified_now = DateTime.utc_now() |> DateTime.truncate(:second)

    case Accounts.get_account_by_email(user["email"]) do
      %Account{email_verified_at: nil} = account ->
        claim(account, verified_now)

      %Account{} = account ->
        {:ok, account}

      nil ->
        Accounts.register(%{
          email: user["email"],
          name: user["name"] || user["email"],
          password: random_password()
        })
        |> case do
          {:ok, account} ->
            account |> Ecto.Changeset.change(email_verified_at: verified_now) |> Repo.update()

          error ->
            error
        end
    end
  end

  defp claim(account, verified_now) do
    Repo.transaction(fn ->
      with {:ok, account} <-
             account
             |> Account.password_changeset(%{password: random_password()})
             |> Ecto.Changeset.put_change(:email_verified_at, verified_now)
             |> Repo.update(),
           {:ok, _count} <- Sessions.revoke_all(account.id) do
        account
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp random_password, do: :crypto.strong_rand_bytes(48) |> Base.url_encode64(padding: false)

  defp ensure_active(%Account{is_active: true}), do: :ok
  defp ensure_active(_account), do: {:error, :account_disabled}

  defp sign_code(session) do
    config = Joken.Config.default_claims(default_exp: @code_ttl)
    claims = %{"type" => @code_type, "session_id" => session.id, "sub" => session.account_id}
    Joken.generate_and_sign!(config, claims, signer())
  end

  defp verify_code(code) when is_binary(code) do
    case Joken.verify_and_validate(Joken.Config.default_claims(), code, signer()) do
      {:ok, %{"type" => @code_type} = claims} -> {:ok, claims}
      _ -> {:error, :invalid_code}
    end
  end

  defp verify_code(_code), do: {:error, :invalid_code}

  defp signer,
    do: Joken.Signer.create("HS256", Application.fetch_env!(:stabileo_auth, :jwt_secret))
end
