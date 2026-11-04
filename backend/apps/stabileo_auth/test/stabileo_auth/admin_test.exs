defmodule StabileoAuth.AdminTest do
  use StabileoRepo.DataCase, async: false

  alias StabileoAuth.{Admin, AdminAccess, Tokens}
  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.{Account, Session}

  setup do
    {:ok, _} = StabileoRepo.Features.set_user_login_enabled(true)
    %{admin: Factory.insert(:admin)}
  end

  describe "AdminAccess.admin?/1" do
    test "is true only for allowlisted emails at an allowed domain", %{admin: admin} do
      assert AdminAccess.admin?(admin)
      assert AdminAccess.admin?(%Account{email: "ADMIN@example.com"})
      Factory.insert(:allowed_email, email: "outside@elsewhere.org")
      refute AdminAccess.admin?(%Account{email: "outside@elsewhere.org"})
      refute AdminAccess.admin?(Factory.insert(:account))
      refute AdminAccess.admin?(nil)
    end
  end

  describe "login/3" do
    test "issues admin tokens to an admin", %{admin: admin} do
      assert {:ok, payload} = Admin.login(admin.email, Factory.password())
      assert payload.account.id == admin.id
      assert {:ok, %{"app" => "admin"}} = Tokens.verify_access_token(payload.access_token)
    end

    test "answers invalid_credentials to a valid non-admin account" do
      account = Factory.insert(:account)
      assert {:error, :invalid_credentials} = Admin.login(account.email, Factory.password())
      assert Repo.aggregate(from(s in Session, where: s.account_id == ^account.id), :count) == 0
    end

    test "answers invalid_credentials to a wrong password", %{admin: admin} do
      assert {:error, :invalid_credentials} = Admin.login(admin.email, "wrong-password")
    end
  end

  describe "refresh/2" do
    test "rotates an admin refresh token", %{admin: admin} do
      {:ok, session} = Admin.login(admin.email, Factory.password())
      assert {:ok, rotated} = Admin.refresh(session.refresh_token)
      assert {:ok, %{"app" => "admin"}} = Tokens.verify_refresh_token(rotated.refresh_token)
    end

    test "refuses a product refresh token" do
      account = Factory.insert(:account)
      {:ok, session} = StabileoAuth.login(account.email, Factory.password())
      assert {:error, :invalid_token_type} = Admin.refresh(session.refresh_token)
    end

    test "refuses once the account is no longer an admin", %{admin: admin} do
      {:ok, session} = Admin.login(admin.email, Factory.password())
      Repo.update_all(StabileoRepo.Schemas.AdminAllowedEmail, set: [is_active: false])

      assert {:error, :forbidden} = Admin.refresh(session.refresh_token)
    end
  end

  test "a product refresh refuses an admin refresh token", %{admin: admin} do
    {:ok, session} = Admin.login(admin.email, Factory.password())
    assert {:error, :invalid_token_type} = StabileoAuth.refresh(session.refresh_token)
  end

  describe "list_accounts/1" do
    setup do
      a = Factory.insert(:account, name: "Zoe Search", email: "zoe-listcase@example.com")

      b =
        Factory.insert(:account,
          name: "Yann",
          email: "yann-listcase@example.com",
          is_active: false
        )

      Factory.insert(:session, account: a)
      Factory.insert(:session, account: a)
      Factory.insert(:session, account: a, revoked_at: ~U[2026-01-01 00:00:00Z])
      %{a: a, b: b}
    end

    test "searches email and name, case-insensitively, with live session counts", %{a: a} do
      {rows, meta} = Admin.list_accounts(%{"search" => "ZOE"})
      assert [{%Account{id: id}, 2}] = rows
      assert id == a.id
      assert meta.total == 1

      {rows, _} =
        Admin.list_accounts(%{"search" => "listcase", "sort_by" => "name", "sort_dir" => "asc"})

      assert Enum.map(rows, fn {acc, _} -> acc.name end) == ["Yann", "Zoe Search"]
    end

    test "treats % and _ in the search as literal characters" do
      {rows, _} = Admin.list_accounts(%{"search" => "%"})
      assert rows == []
    end

    test "filters by status", %{a: a, b: b} do
      ids = fn status ->
        {rows, _} = Admin.list_accounts(%{"status" => status, "search" => "listcase"})
        rows |> Enum.map(fn {acc, _} -> acc.id end) |> Enum.sort()
      end

      assert ids.("active") == [a.id]
      assert ids.("disabled") == [b.id]
      assert ids.("all") == Enum.sort([a.id, b.id])
    end
  end

  describe "disable/2, enable/1, force_logout/1" do
    test "disable deactivates and revokes every session", %{admin: admin} do
      account = Factory.insert(:account)
      Factory.insert(:session, account: account)

      assert {:ok, {%Account{is_active: false}, 0}} = Admin.disable(admin, account)
      refute Repo.get!(Account, account.id).is_active
      assert Repo.aggregate(from(s in Session, where: is_nil(s.revoked_at)), :count) == 0
    end

    test "an admin cannot disable themselves", %{admin: admin} do
      assert {:error, :cannot_disable_self} = Admin.disable(admin, admin)
      assert Repo.get!(Account, admin.id).is_active
    end

    test "enable reactivates" do
      account = Factory.insert(:account, is_active: false)
      assert {:ok, {%Account{is_active: true}, 0}} = Admin.enable(account)
      assert Repo.get!(Account, account.id).is_active
    end

    test "force_logout revokes sessions and keeps the account active" do
      account = Factory.insert(:account)
      Factory.insert(:session, account: account)
      Factory.insert(:session, account: account)

      assert {:ok, {%Account{}, 0}, 2} = Admin.force_logout(account)
      assert Repo.get!(Account, account.id).is_active
    end
  end
end
