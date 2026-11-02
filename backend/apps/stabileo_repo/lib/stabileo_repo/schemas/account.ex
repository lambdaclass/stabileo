defmodule StabileoRepo.Schemas.Account do
  @moduledoc """
  A person's identity: one email, one account. Holds credentials and the
  profile.
  """

  use StabileoRepo.Schema
  import Ecto.Changeset

  @type t :: %__MODULE__{}

  @locales ~w(es en pt de fr tr)
  @profile_fields [:name, :company, :job_title, :country, :locale]

  schema "accounts" do
    field(:email, :string)
    field(:password, :string, virtual: true, redact: true)
    field(:password_hash, :string, redact: true)
    field(:name, :string)
    field(:company, :string)
    field(:job_title, :string)
    field(:country, :string)
    field(:locale, :string, default: "es")
    field(:email_verified_at, :utc_datetime)
    field(:last_sign_in_at, :utc_datetime)
    field(:is_active, :boolean, default: true)

    timestamps()
  end

  def locales, do: @locales

  @doc "Sign-up: email, password and name are required."
  def registration_changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, [:email, :password, :name, :locale])
    |> validate_required([:email, :password, :name])
    |> validate_email()
    |> validate_profile()
    |> validate_password()
    |> hash_password()
  end

  @doc "Profile edits. Never touches email, credentials or status."
  def profile_changeset(account, attrs) do
    account
    |> cast(attrs, @profile_fields)
    |> update_change(:country, &upcase/1)
    |> validate_required([:name, :locale])
    |> validate_profile()
  end

  def password_changeset(account, attrs) do
    account
    |> cast(attrs, [:password])
    |> validate_required([:password])
    |> validate_password()
    |> hash_password()
  end

  def sign_in_changeset(account) do
    change(account, last_sign_in_at: DateTime.utc_now() |> DateTime.truncate(:second))
  end

  @doc "Runs a dummy hash when there is no account, so timing does not reveal which emails exist."
  def valid_password?(%__MODULE__{password_hash: hash}, password)
      when is_binary(hash) and is_binary(password) and byte_size(password) > 0 do
    Argon2.verify_pass(password, hash)
  end

  def valid_password?(_, _) do
    Argon2.no_user_verify()
    false
  end

  defp validate_email(changeset) do
    changeset
    |> update_change(:email, &(&1 |> trim() |> downcase()))
    |> validate_format(:email, ~r/^[^\s@]+@[^\s@]+$/, message: "must have @ sign and no spaces")
    |> validate_length(:email, max: 255)
    |> unique_constraint(:email)
  end

  defp validate_profile(changeset) do
    changeset
    |> update_change(:name, &trim/1)
    |> update_change(:company, &trim/1)
    |> update_change(:job_title, &trim/1)
    |> validate_length(:name, min: 1, max: 255)
    |> validate_length(:company, max: 255)
    |> validate_length(:job_title, max: 255)
    |> validate_format(:country, ~r/^[A-Z]{2}$/, message: "must be a two-letter ISO code")
    |> validate_inclusion(:locale, @locales)
  end

  defp validate_password(changeset) do
    validate_length(changeset, :password, min: 8, max: 72)
  end

  defp hash_password(changeset) do
    case {changeset.valid?, get_change(changeset, :password)} do
      {true, password} when is_binary(password) ->
        changeset
        |> put_change(:password_hash, Argon2.hash_pwd_salt(password))
        |> delete_change(:password)

      _ ->
        changeset
    end
  end

  defp trim(value) when is_binary(value), do: String.trim(value)
  defp trim(value), do: value

  defp downcase(value) when is_binary(value), do: String.downcase(value)
  defp downcase(value), do: value

  defp upcase(value) when is_binary(value), do: value |> String.trim() |> String.upcase()
  defp upcase(value), do: value
end
