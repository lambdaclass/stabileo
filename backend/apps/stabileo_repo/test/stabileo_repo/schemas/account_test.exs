defmodule StabileoRepo.Schemas.AccountTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.Account

  @valid %{email: "account-schema@example.com", password: "long-enough", name: "Ada"}

  describe "registration_changeset/1" do
    test "inserts a hashed password and defaults" do
      assert {:ok, account} = @valid |> Account.registration_changeset() |> Repo.insert()

      saved = Repo.get!(Account, account.id)
      assert saved.email == "account-schema@example.com"
      assert saved.name == "Ada"
      assert saved.locale == "es"
      assert saved.is_active == true
      assert saved.email_verified_at == nil
      assert saved.password == nil
      assert "$argon2" <> _ = saved.password_hash
      assert Account.valid_password?(saved, "long-enough")
    end

    test "requires email" do
      changeset = @valid |> Map.delete(:email) |> Account.registration_changeset()
      assert %{email: ["can't be blank"]} = errors_on(changeset)
    end

    test "requires password" do
      changeset = @valid |> Map.delete(:password) |> Account.registration_changeset()
      assert %{password: ["can't be blank"]} = errors_on(changeset)
    end

    test "requires name" do
      changeset = @valid |> Map.delete(:name) |> Account.registration_changeset()
      assert %{name: ["can't be blank"]} = errors_on(changeset)
    end

    test "a whitespace-only name is blank" do
      changeset = @valid |> Map.put(:name, "   ") |> Account.registration_changeset()
      assert %{name: ["can't be blank"]} = errors_on(changeset)
    end

    test "unknown key (full_name instead of name) is dropped by cast" do
      changeset =
        @valid
        |> Map.delete(:name)
        |> Map.put(:full_name, "Ada")
        |> Account.registration_changeset()

      refute changeset.valid?
      assert %{name: ["can't be blank"]} = errors_on(changeset)
    end

    test "trims and lowercases the email" do
      changeset =
        @valid |> Map.put(:email, "  Ada@Example.COM ") |> Account.registration_changeset()

      assert changeset.valid?
      assert get_change(changeset, :email) == "ada@example.com"
    end

    test "rejects an email without @" do
      changeset = @valid |> Map.put(:email, "not-an-email") |> Account.registration_changeset()
      assert %{email: ["must have @ sign and no spaces"]} = errors_on(changeset)
    end

    test "rejects a password shorter than 8 and does not hash it" do
      changeset = @valid |> Map.put(:password, "short") |> Account.registration_changeset()
      assert %{password: ["should be at least 8 character(s)"]} = errors_on(changeset)
      assert get_change(changeset, :password_hash) == nil
    end

    test "rejects a password longer than 72" do
      changeset =
        @valid
        |> Map.put(:password, String.duplicate("a", 73))
        |> Account.registration_changeset()

      assert %{password: ["should be at most 72 character(s)"]} = errors_on(changeset)
    end

    test "rejects an unknown locale" do
      changeset = @valid |> Map.put(:locale, "xx") |> Account.registration_changeset()
      assert %{locale: ["is invalid"]} = errors_on(changeset)
    end

    test "ignores is_active and email_verified_at from the caller" do
      changeset =
        @valid
        |> Map.merge(%{is_active: false, email_verified_at: ~U[2026-01-01 00:00:00Z]})
        |> Account.registration_changeset()

      assert get_change(changeset, :is_active) == nil
      assert get_change(changeset, :email_verified_at) == nil
    end

    test "rejects a duplicate email regardless of case, leaving one row" do
      {:ok, _} = @valid |> Account.registration_changeset() |> Repo.insert()

      {:error, changeset} =
        @valid
        |> Map.put(:email, "ACCOUNT-SCHEMA@example.com")
        |> Account.registration_changeset()
        |> Repo.insert()

      assert %{email: ["has already been taken"]} = errors_on(changeset)

      assert Repo.aggregate(
               from(a in Account, where: a.email == "account-schema@example.com"),
               :count
             ) == 1
    end
  end

  describe "profile_changeset/2" do
    setup do
      %{account: Factory.insert(:account)}
    end

    test "updates every profile field", %{account: account} do
      attrs = %{
        name: " Ada Lovelace ",
        company: "Analytical Engines",
        job_title: "Structural engineer",
        country: "ar",
        locale: "en"
      }

      assert {:ok, updated} = account |> Account.profile_changeset(attrs) |> Repo.update()

      saved = Repo.get!(Account, updated.id)
      assert saved.name == "Ada Lovelace"
      assert saved.company == "Analytical Engines"
      assert saved.job_title == "Structural engineer"
      assert saved.country == "AR"
      assert saved.locale == "en"
    end

    test "an empty string clears an optional field", %{account: account} do
      {:ok, account} = account |> Account.profile_changeset(%{company: "Acme"}) |> Repo.update()
      {:ok, account} = account |> Account.profile_changeset(%{company: ""}) |> Repo.update()

      assert Repo.get!(Account, account.id).company == nil
    end

    test "cannot clear the name", %{account: account} do
      changeset = Account.profile_changeset(account, %{name: ""})
      assert %{name: ["can't be blank"]} = errors_on(changeset)
    end

    test "rejects a country that is not two letters", %{account: account} do
      changeset = Account.profile_changeset(account, %{country: "ARG"})
      assert %{country: ["must be a two-letter ISO code"]} = errors_on(changeset)
    end

    test "rejects an unknown locale", %{account: account} do
      changeset = Account.profile_changeset(account, %{locale: "xx"})
      assert %{locale: ["is invalid"]} = errors_on(changeset)
    end

    test "ignores email, password and status", %{account: account} do
      changeset =
        Account.profile_changeset(account, %{
          email: "other@example.com",
          password: "new-password",
          password_hash: "x",
          is_active: false
        })

      assert changeset.changes == %{}
    end
  end

  describe "password_changeset/2" do
    test "rehashes a valid password" do
      account = Factory.insert(:account)

      assert {:ok, updated} =
               account
               |> Account.password_changeset(%{password: "a-new-password"})
               |> Repo.update()

      saved = Repo.get!(Account, updated.id)
      assert Account.valid_password?(saved, "a-new-password")
      refute Account.valid_password?(saved, Factory.password())
    end

    test "requires a password" do
      changeset = Account.password_changeset(%Account{}, %{})
      assert %{password: ["can't be blank"]} = errors_on(changeset)
    end
  end

  describe "valid_password?/2" do
    test "is false without an account or with an empty password" do
      refute Account.valid_password?(nil, "anything")
      refute Account.valid_password?(Factory.insert(:account), "")
    end
  end
end
