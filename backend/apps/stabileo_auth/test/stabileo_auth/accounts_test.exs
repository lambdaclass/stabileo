defmodule StabileoAuth.AccountsTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoAuth.Accounts
  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.{Account, Session}

  describe "register/1" do
    test "creates an account" do
      assert {:ok, account} =
               Accounts.register(%{
                 "email" => "Reg@Example.com",
                 "password" => "long-enough",
                 "name" => "Reg"
               })

      saved = Repo.get!(Account, account.id)
      assert saved.email == "reg@example.com"
      assert saved.name == "Reg"
    end

    test "rejects a taken email" do
      existing = Factory.insert(:account)

      assert {:error, changeset} =
               Accounts.register(%{
                 email: String.upcase(existing.email),
                 password: "long-enough",
                 name: "X"
               })

      assert %{email: ["has already been taken"]} = errors_on(changeset)
    end
  end

  describe "authenticate/2" do
    test "accepts the right password, case-insensitively on email" do
      account = Factory.insert(:account)

      assert {:ok, %Account{id: id}} =
               Accounts.authenticate(" " <> String.upcase(account.email), Factory.password())

      assert id == account.id
    end

    test "answers the same error for a wrong password and an unknown email" do
      account = Factory.insert(:account)

      assert {:error, :invalid_credentials} =
               Accounts.authenticate(account.email, "wrong-password")

      assert {:error, :invalid_credentials} =
               Accounts.authenticate("nobody@example.com", "whatever")

      assert {:error, :invalid_credentials} = Accounts.authenticate(nil, nil)
    end

    test "reports a disabled account only with the right password" do
      account = Factory.insert(:account, is_active: false)

      assert {:error, :account_disabled} =
               Accounts.authenticate(account.email, Factory.password())

      assert {:error, :invalid_credentials} =
               Accounts.authenticate(account.email, "wrong-password")
    end
  end

  describe "update_profile/2" do
    test "persists profile fields and ignores the email" do
      account = Factory.insert(:account)

      assert {:ok, updated} =
               Accounts.update_profile(account, %{
                 "name" => "New Name",
                 "company" => "Acme",
                 "email" => "hijack@example.com"
               })

      saved = Repo.get!(Account, updated.id)
      assert saved.name == "New Name"
      assert saved.company == "Acme"
      assert saved.email == account.email
    end

    test "returns the failing field" do
      account = Factory.insert(:account)

      assert {:error, changeset} = Accounts.update_profile(account, %{"country" => "Argentina"})
      assert %{country: ["must be a two-letter ISO code"]} = errors_on(changeset)
    end
  end

  describe "change_password/4" do
    setup do
      account = Factory.insert(:account)
      keep = Factory.insert(:session, account: account)
      other = Factory.insert(:session, account: account)
      %{account: account, keep: keep, other: other}
    end

    test "changes the password and revokes every other session", ctx do
      assert {:ok, _} =
               Accounts.change_password(
                 ctx.account,
                 Factory.password(),
                 "brand-new-pass",
                 ctx.keep.id
               )

      assert {:ok, _} = Accounts.authenticate(ctx.account.email, "brand-new-pass")
      assert Repo.get!(Session, ctx.keep.id).revoked_at == nil
      assert %DateTime{} = Repo.get!(Session, ctx.other.id).revoked_at
    end

    test "refuses a wrong current password and changes nothing", ctx do
      assert {:error, :invalid_current_password} =
               Accounts.change_password(ctx.account, "not-it", "brand-new-pass", ctx.keep.id)

      assert {:ok, _} = Accounts.authenticate(ctx.account.email, Factory.password())
      assert Repo.get!(Session, ctx.other.id).revoked_at == nil
    end

    test "refuses a short new password and revokes nothing", ctx do
      assert {:error, changeset} =
               Accounts.change_password(ctx.account, Factory.password(), "short", ctx.keep.id)

      assert %{password: ["should be at least 8 character(s)"]} = errors_on(changeset)
      assert Repo.get!(Session, ctx.other.id).revoked_at == nil
    end
  end
end
