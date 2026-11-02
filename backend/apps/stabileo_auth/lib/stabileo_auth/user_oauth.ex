defmodule StabileoAuth.UserOAuth do
  @moduledoc """
  Product sign-in with Google, the only way into an account while password
  sign-in is off (`:user_password_login`).

  The callback checks the Google identity and hands the browser a one-time
  code. For a known person the code stands for a session that is already open;
  the app trades it for tokens. For someone new it carries only who Google
  said they are: the trade answers a sign-up token, and the account is created
  when the terms are accepted (`register/3`), as sign-up with a password did.

  A known person is found by Google's subject, else by the email Google
  verified. An account found by email takes the subject; one nobody verified
  (opened with a password before) is the Google owner's from here on, so its
  password and sessions end.
  """

  alias StabileoAuth.{Accounts, Consents, Sessions, Tokens}
  alias StabileoRepo.{Features, Repo}
  alias StabileoRepo.Schemas.Account

  @code_ttl 60
  @signup_ttl 900
  @session_code "user_oauth_code"
  @signup_code "user_oauth_signup"
  @signup_token "user_signup"

  @doc "Answers `{:ok, code}` or `{:error, oauth_error}`."
  def sign_in(%{} = user, metadata \\ %{}) do
    email = user["email"]
    subject = user["sub"]

    cond do
      not Features.user_login_enabled?() -> {:error, :user_login_disabled}
      not present?(email) or not present?(subject) -> {:error, :callback_failed}
      user["email_verified"] != true -> {:error, :email_not_verified}
      true -> resolve(user, metadata)
    end
  end

  @doc """
  Trades a callback code: `{:ok, session_payload}` for a known person,
  `{:ok, %{signup_required: true, ...}}` for someone new.
  """
  def exchange(code, metadata \\ %{}) do
    case verify(code) do
      {:ok, %{"type" => @session_code, "session_id" => session_id}} ->
        open_session(session_id, metadata)

      {:ok, %{"type" => @signup_code} = claims} ->
        {:ok,
         %{
           signup_required: true,
           signup_token: sign(Map.put(claims, "type", @signup_token), @signup_ttl),
           email: claims["email"],
           name: claims["name"]
         }}

      _ ->
        {:error, :invalid_or_expired_code}
    end
  end

  @doc """
  Opens the account a sign-up token stands for. Needs `"accept_terms" => true`,
  with the optional `"usage_analytics"` and `"model_research"` choices.
  """
  def register(token, attrs, metadata \\ %{}) do
    with :ok <- login_open(),
         {:ok, %{"type" => @signup_token} = claims} <- verify(token),
         :ok <- require_terms(attrs),
         {:ok, account} <- create_account(claims, attrs, metadata) do
      StabileoAuth.sign_in(account, metadata, "app")
    else
      {:ok, _claims} -> {:error, :invalid_or_expired_code}
      {:error, reason} -> {:error, reason}
    end
  end

  defp resolve(user, metadata) do
    case find(user) do
      {:ok, account} ->
        with :ok <- ensure_active(account),
             {:ok, account} <- Accounts.record_sign_in(account),
             {:ok, session} <-
               Sessions.create_session(account, metadata, Tokens.refresh_token_ttl("app")) do
          {:ok, sign(%{"type" => @session_code, "session_id" => session.id}, @code_ttl)}
        end

      :new ->
        claims = %{
          "type" => @signup_code,
          "sub" => user["sub"],
          "email" => String.downcase(user["email"]),
          "name" => name_of(user)
        }

        {:ok, sign(claims, @code_ttl)}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp find(user) do
    case Repo.get_by(Account, google_subject: user["sub"]) do
      %Account{} = account ->
        {:ok, account}

      nil ->
        case Accounts.get_account_by_email(user["email"]) do
          nil -> :new
          %Account{google_subject: nil} = account -> link(account, user["sub"])
          %Account{} -> {:error, :callback_failed}
        end
    end
  end

  defp link(%Account{email_verified_at: nil} = account, subject) do
    Repo.transaction(fn ->
      with {:ok, account} <-
             account
             |> Ecto.Changeset.change(
               google_subject: subject,
               password_hash: nil,
               email_verified_at: now()
             )
             |> Repo.update(),
           {:ok, _count} <- Sessions.revoke_all(account.id) do
        account
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp link(%Account{} = account, subject) do
    account |> Ecto.Changeset.change(google_subject: subject) |> Repo.update()
  end

  defp open_session(session_id, metadata) do
    with %{} = session <- Sessions.get_session(session_id),
         :ok <- Sessions.validate_session(session),
         %Account{is_active: true} = account <- Accounts.get_account(session.account_id),
         {:ok, rotated} <-
           Sessions.rotate_session(session, metadata, Tokens.refresh_token_ttl("app")) do
      StabileoAuth.session_payload(account, rotated, "app")
    else
      _ -> {:error, :invalid_or_expired_code}
    end
  end

  defp create_account(claims, attrs, metadata) do
    changeset =
      %{
        email: claims["email"],
        name: claims["name"],
        google_subject: claims["sub"],
        locale: attrs["locale"]
      }
      |> Map.reject(fn {_key, value} -> is_nil(value) end)
      |> Account.google_changeset()

    Repo.transaction(fn ->
      with {:ok, account} <- Repo.insert(changeset),
           {:ok, :ok} <- Consents.record_sign_up(account, attrs, metadata) do
        account
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp require_terms(%{"accept_terms" => true}), do: :ok

  defp require_terms(_attrs),
    do: {:error, {:validation, %{accept_terms: ["must be accepted"]}}}

  defp login_open do
    if Features.user_login_enabled?(), do: :ok, else: {:error, :user_login_disabled}
  end

  defp ensure_active(%Account{is_active: true}), do: :ok
  defp ensure_active(_account), do: {:error, :account_disabled}

  defp name_of(user) do
    case user["name"] do
      name when is_binary(name) and name != "" -> String.trim(name)
      _ -> user["email"]
    end
  end

  defp sign(claims, ttl) do
    config = Joken.Config.default_claims(default_exp: ttl)
    Joken.generate_and_sign!(config, claims, signer())
  end

  defp verify(token) when is_binary(token) do
    case Joken.verify_and_validate(Joken.Config.default_claims(), token, signer()) do
      {:ok, claims} -> {:ok, claims}
      _ -> {:error, :invalid_or_expired_code}
    end
  end

  defp verify(_token), do: {:error, :invalid_or_expired_code}

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)

  defp present?(value), do: is_binary(value) and value != ""

  defp signer,
    do: Joken.Signer.create("HS256", Application.fetch_env!(:stabileo_auth, :jwt_secret))
end
