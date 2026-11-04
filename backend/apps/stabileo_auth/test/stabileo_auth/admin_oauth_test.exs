defmodule StabileoAuth.AdminOAuthTest do
  use StabileoRepo.DataCase, async: false

  alias StabileoAuth.{AdminOAuth, Sessions, Tokens}
  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.{Account, Session}

  defp google(attrs \\ %{}) do
    Map.merge(
      %{
        "email" => "staff@example.com",
        "email_verified" => true,
        "hd" => "example.com",
        "name" => "Staff",
        "sub" => "g-1"
      },
      attrs
    )
  end

  setup do
    Factory.insert(:allowed_email, email: "staff@example.com")
    :ok
  end

  describe "sign_in/2" do
    test "creates a verified account on first sign-in and opens an admin session" do
      assert {:ok, code} = AdminOAuth.sign_in(google())

      account = Repo.get_by!(Account, email: "staff@example.com")
      assert account.name == "Staff"
      assert %DateTime{} = account.email_verified_at
      assert %DateTime{} = account.last_sign_in_at
      assert Repo.aggregate(from(s in Session, where: s.account_id == ^account.id), :count) == 1
      assert is_binary(code)
    end

    test "reuses an existing account and marks it verified" do
      existing = Factory.insert(:account, email: "staff@example.com", name: "Existing")

      assert {:ok, _code} = AdminOAuth.sign_in(google())

      saved = Repo.get!(Account, existing.id)
      assert saved.name == "Existing"
      assert %DateTime{} = saved.email_verified_at

      assert Repo.aggregate(from(a in Account, where: a.email == "staff@example.com"), :count) ==
               1
    end

    # Whoever signed the address up in the product may not own it.
    test "an account nobody verified loses its password and its sessions" do
      existing = Factory.insert(:account, email: "staff@example.com")
      {:ok, earlier} = Sessions.create_session(existing)

      assert {:ok, _code} = AdminOAuth.sign_in(google())

      saved = Repo.get!(Account, existing.id)
      refute Account.valid_password?(saved, Factory.password())
      assert %DateTime{} = Repo.get!(Session, earlier.id).revoked_at
    end

    test "an account already verified keeps its password and its sessions" do
      verified_at = DateTime.utc_now() |> DateTime.truncate(:second)

      existing =
        Factory.insert(:account, email: "staff@example.com")
        |> Ecto.Changeset.change(email_verified_at: verified_at)
        |> Repo.update!()

      {:ok, earlier} = Sessions.create_session(existing)

      assert {:ok, _code} = AdminOAuth.sign_in(google())

      assert Account.valid_password?(Repo.get!(Account, existing.id), Factory.password())
      assert Repo.get!(Session, earlier.id).revoked_at == nil
    end

    test "refuses an unverified email" do
      assert {:error, :email_not_verified} =
               AdminOAuth.sign_in(google(%{"email_verified" => false}))

      refute Repo.get_by(Account, email: "staff@example.com")
    end

    test "refuses a personal Google account with a company address (no hd)" do
      assert {:error, :domain_not_allowed} = AdminOAuth.sign_in(google(%{"hd" => nil}))
    end

    test "refuses a Workspace domain that is not allowed, or that does not match the email" do
      assert {:error, :domain_not_allowed} = AdminOAuth.sign_in(google(%{"hd" => "other.org"}))

      Factory.insert(:allowed_email, email: "x@example.com")

      assert {:error, :domain_not_allowed} =
               AdminOAuth.sign_in(google(%{"email" => "x@gmail.com", "hd" => "example.com"}))
    end

    test "refuses an email that is not on the allowlist, or was removed from it" do
      assert {:error, :email_not_allowed} =
               AdminOAuth.sign_in(google(%{"email" => "nobody@example.com"}))

      Repo.update_all(StabileoRepo.Schemas.AdminAllowedEmail, set: [is_active: false])
      assert {:error, :email_not_allowed} = AdminOAuth.sign_in(google())
    end

    test "refuses a disabled account without opening a session" do
      account = Factory.insert(:account, email: "staff@example.com", is_active: false)

      assert {:error, :account_disabled} = AdminOAuth.sign_in(google())
      assert Repo.aggregate(from(s in Session, where: s.account_id == ^account.id), :count) == 0
    end
  end

  describe "exchange/2" do
    test "trades the code once for admin tokens" do
      {:ok, code} = AdminOAuth.sign_in(google())

      assert {:ok, payload} = AdminOAuth.exchange(code)
      assert payload.account.email == "staff@example.com"
      assert {:ok, %{"app" => "admin"}} = Tokens.verify_access_token(payload.access_token)
      assert {:ok, %{"app" => "admin"}} = Tokens.verify_refresh_token(payload.refresh_token)

      assert {:error, :invalid_or_expired_code} = AdminOAuth.exchange(code)
    end

    test "refuses a code of another type, a garbage code, or nothing" do
      account = Factory.insert(:account)
      session = Factory.insert(:session, account: account)
      {:ok, refresh} = Tokens.generate_refresh_token(session, "admin")

      for code <- [refresh, "garbage", nil] do
        assert {:error, :invalid_or_expired_code} = AdminOAuth.exchange(code)
      end
    end

    test "refuses once the email left the allowlist between callback and exchange" do
      {:ok, code} = AdminOAuth.sign_in(google())
      Repo.update_all(StabileoRepo.Schemas.AdminAllowedEmail, set: [is_active: false])

      assert {:error, :invalid_or_expired_code} = AdminOAuth.exchange(code)
    end
  end
end
