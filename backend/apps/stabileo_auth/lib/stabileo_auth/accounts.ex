defmodule StabileoAuth.Accounts do
  @moduledoc "Accounts: sign-up, credentials and profile."

  alias StabileoAuth.Sessions
  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.Account

  def get_account(id) do
    case Ecto.UUID.cast(id) do
      {:ok, uuid} -> Repo.get(Account, uuid)
      :error -> nil
    end
  end

  def get_account_by_email(email) when is_binary(email) do
    Repo.get_by(Account, email: email |> String.trim() |> String.downcase())
  end

  def get_account_by_email(_email), do: nil

  def register(attrs) do
    attrs
    |> Account.registration_changeset()
    |> Repo.insert()
  end

  @doc """
  Hashes exactly once whether or not the email exists, so timing does not tell
  an unknown email from a wrong password. A disabled account is reported only
  to a caller who knows its password.
  """
  def authenticate(email, password) do
    account = get_account_by_email(email)

    case {Account.valid_password?(account, password), account} do
      {true, %Account{is_active: true}} -> {:ok, account}
      {true, %Account{is_active: false}} -> {:error, :account_disabled}
      _ -> {:error, :invalid_credentials}
    end
  end

  def record_sign_in(%Account{} = account) do
    account
    |> Account.sign_in_changeset()
    |> Repo.update()
  end

  def update_profile(%Account{} = account, attrs) do
    account
    |> Account.profile_changeset(attrs)
    |> Repo.update()
  end

  @doc "Changes the password and revokes every session but `keep_session_id`."
  def change_password(%Account{} = account, current_password, new_password, keep_session_id) do
    if Account.valid_password?(account, current_password) do
      Repo.transaction(fn -> set_password(account, new_password, keep_session_id) end)
    else
      {:error, :invalid_current_password}
    end
  end

  defp set_password(account, new_password, keep_session_id) do
    with {:ok, updated} <-
           account
           |> Account.password_changeset(%{password: new_password})
           |> Repo.update(),
         {:ok, _count} <- Sessions.revoke_all_except(account.id, keep_session_id) do
      updated
    else
      {:error, reason} -> Repo.rollback(reason)
    end
  end
end
