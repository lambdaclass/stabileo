defmodule StabileoAuth.UserOAuth do
  @moduledoc """
  Product sign-in with Google, the only way into an account while password
  sign-in is off (`:user_password_login`).

  The callback checks the Google identity and hands the browser a one-time
  code. For a known person the code stands for a session that is already open;
  the app trades it for tokens. For someone new it carries only who Google
  said they are: the trade answers a sign-up token, and the account is created
  when the terms are accepted (`register/3`), as sign-up with a password did.

  Every code belongs to the sign-in attempt that asked for it: the app sends
  the SHA-256 of a secret it keeps (`attempt`) when it opens Google, and trades
  the code only with that secret (`verifier`), so a code from another attempt,
  tab or browser is refused.

  A known person is found by Google's subject, else by email, and only when
  Google answers for that address (Gmail, or a Workspace domain in `hd`): for
  any other address `email_verified` may be a check from years ago. An account
  found by email takes the subject; one nobody verified (opened with a password
  before) is the Google owner's from here on, so its password and sessions end.
  """

  alias StabileoAuth.{Accounts, Consents, Sessions, Tokens}
  alias StabileoRepo.{Features, Repo}
  alias StabileoRepo.Schemas.Account

  @code_ttl 60
  @signup_ttl 900
  @session_code "user_oauth_code"
  @signup_code "user_oauth_signup"
  @signup_token "user_signup"
  @google_mail ~w(gmail.com googlemail.com)

  @doc "The `attempt` the app sends for a `verifier`."
  def challenge(verifier),
    do: :crypto.hash(:sha256, verifier) |> Base.url_encode64(padding: false)

  def valid_attempt?(attempt), do: is_binary(attempt) and attempt =~ ~r/\A[A-Za-z0-9_-]{43}\z/

  @doc "Answers `{:ok, code}` or `{:error, oauth_error}`."
  def sign_in(%{} = user, attempt, metadata \\ %{}) do
    email = user["email"]
    subject = user["sub"]

    cond do
      not Features.user_login_enabled?() -> {:error, :user_login_disabled}
      not valid_attempt?(attempt) -> {:error, :invalid_state}
      not present?(email) or not present?(subject) -> {:error, :callback_failed}
      user["email_verified"] != true -> {:error, :email_not_verified}
      true -> resolve(user, attempt, metadata)
    end
  end

  @doc """
  Trades a callback code: `{:ok, session_payload}` for a known person,
  `{:ok, %{signup_required: true, ...}}` for someone new.
  """
  def exchange(code, verifier, metadata \\ %{}) do
    with {:ok, claims} <- verify(code),
         :ok <- same_attempt(claims, verifier) do
      case claims do
        %{"type" => @session_code, "session_id" => session_id} ->
          open_session(session_id, metadata)

        %{"type" => @signup_code} ->
          signup =
            claims
            |> Map.take(~w(sub email name))
            |> Map.put("type", @signup_token)

          {:ok,
           %{
             signup_required: true,
             signup_token: sign(signup, @signup_ttl),
             email: claims["email"],
             name: claims["name"]
           }}

        _ ->
          {:error, :invalid_or_expired_code}
      end
    end
  end

  defp same_attempt(%{"attempt" => attempt}, verifier)
       when is_binary(attempt) and is_binary(verifier) do
    if Plug.Crypto.secure_compare(challenge(verifier), attempt),
      do: :ok,
      else: {:error, :invalid_or_expired_code}
  end

  defp same_attempt(_claims, _verifier), do: {:error, :invalid_or_expired_code}

  @doc """
  Opens the account a sign-up token stands for. Needs `"accept_terms" => true`,
  with the optional `"usage_analytics"` and `"model_research"` choices. The
  `:after_sign_up` module (config) runs in the same transaction with `attrs`,
  which may carry where the visit came from (`"source"`) and the pixel's
  cookies (`"attribution"`).
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

  defp resolve(user, attempt, metadata) do
    case find(user) do
      {:ok, account} ->
        with :ok <- ensure_active(account),
             {:ok, account} <- Accounts.record_sign_in(account),
             {:ok, session} <-
               Sessions.create_session(account, metadata, Tokens.refresh_token_ttl("app")) do
          {:ok,
           sign(
             %{"type" => @session_code, "session_id" => session.id, "attempt" => attempt},
             @code_ttl
           )}
        end

      :new ->
        claims = %{
          "type" => @signup_code,
          "attempt" => attempt,
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
      %Account{} = account -> {:ok, account}
      nil -> find_by_email(user, Accounts.get_account_by_email(user["email"]))
    end
  end

  defp find_by_email(_user, nil), do: :new

  defp find_by_email(user, %Account{google_subject: nil} = account) do
    if google_mail?(user), do: link(account, user["sub"]), else: {:error, :email_in_use}
  end

  defp find_by_email(_user, %Account{}), do: {:error, :callback_failed}

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

  defp google_mail?(user) do
    domain = user["email"] |> String.downcase() |> String.split("@") |> List.last()
    hd = if is_binary(user["hd"]), do: String.downcase(user["hd"])
    domain in @google_mail or domain == hd
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
           {:ok, :ok} <- Consents.record_sign_up(account, attrs, metadata),
           :ok <- after_sign_up(account, attrs, metadata) do
        account
      else
        {:error, reason} -> Repo.rollback(reason)
      end
    end)
  end

  defp after_sign_up(account, attrs, metadata) do
    case Application.get_env(:stabileo_auth, :after_sign_up) do
      nil -> :ok
      module -> module.after_sign_up(account, attrs, metadata)
    end
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
