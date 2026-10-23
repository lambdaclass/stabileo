defmodule StabileoRepo.Factory do
  @moduledoc "Test data builders."

  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.{Account, AdminAllowedEmail, Session}

  @password "factory-password"

  def password, do: @password

  def unique_email(prefix \\ "user") do
    "#{prefix}-#{System.unique_integer([:positive])}@example.com"
  end

  def insert(type, attrs \\ %{})

  def insert(:account, attrs) do
    attrs = Map.new(attrs)
    {is_active, attrs} = Map.pop(attrs, :is_active, true)

    %{email: unique_email(), password: @password, name: "Test User"}
    |> Map.merge(attrs)
    |> Account.registration_changeset()
    |> Ecto.Changeset.put_change(:is_active, is_active)
    |> Repo.insert!()
  end

  def insert(:admin, attrs) do
    attrs = Map.new(attrs)
    account = insert(:account, Map.merge(%{email: "admin@example.com", name: "Admin"}, attrs))
    insert(:allowed_email, email: account.email)
    account
  end

  def insert(:allowed_email, attrs) do
    attrs = Map.new(attrs)

    Repo.insert!(
      struct(
        AdminAllowedEmail,
        Map.merge(%{email: unique_email("allowed"), is_active: true}, attrs)
      )
    )
  end

  def insert(:session, attrs) do
    attrs = Map.new(attrs)
    account = attrs[:account] || insert(:account)

    %Session{}
    |> Session.changeset(%{
      account_id: account.id,
      expires_at: DateTime.utc_now() |> DateTime.add(3600) |> DateTime.truncate(:second)
    })
    |> Ecto.Changeset.change(Map.drop(attrs, [:account]))
    |> Repo.insert!()
  end
end
