defmodule StabileoRepo.Schemas.AdminAllowedEmail do
  @moduledoc """
  An email allowed into the admin site. Removing it sets `is_active` to
  false; adding it again reactivates the same row.
  """

  use StabileoRepo.Schema
  import Ecto.Changeset

  alias StabileoRepo.Schemas.Account

  @type t :: %__MODULE__{}

  schema "admin_allowed_emails" do
    field(:email, :string)
    field(:is_active, :boolean, default: true)

    belongs_to(:added_by, Account)

    timestamps()
  end

  @doc "`domains` are the allowed email domains; an email elsewhere is rejected."
  def changeset(allowed, attrs, domains) do
    allowed
    |> cast(attrs, [:email])
    |> update_change(:email, &(&1 |> String.trim() |> String.downcase()))
    |> validate_required([:email])
    |> validate_format(:email, ~r/^[^\s@]+@[^\s@]+$/, message: "must have @ sign and no spaces")
    |> validate_length(:email, max: 255)
    |> validate_domain(domains)
    |> unique_constraint(:email, message: "is already allowed")
  end

  defp validate_domain(changeset, domains) do
    validate_change(changeset, :email, fn :email, email ->
      if domain_of(email) in [nil | domains],
        do: [],
        else: [email: "must be at an allowed domain"]
    end)
  end

  defp domain_of(email) do
    case String.split(email, "@") do
      [_, domain] -> domain
      _ -> nil
    end
  end
end
