defmodule StabileoAuth.SessionsTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoAuth.{Sessions, Tokens}
  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.Session

  test "create_session stores metadata and an expiry one refresh TTL away" do
    account = Factory.insert(:account)

    {:ok, session} =
      Sessions.create_session(account, %{
        ip_address: "10.0.0.1",
        user_agent: String.duplicate("x", 300)
      })

    saved = Repo.get!(Session, session.id)
    assert saved.account_id == account.id
    assert saved.ip_address == "10.0.0.1"
    assert String.length(saved.user_agent) == 255

    assert_in_delta DateTime.diff(saved.expires_at, DateTime.utc_now()),
                    Tokens.refresh_token_ttl(),
                    5
  end

  describe "verify_refresh_token/1" do
    test "accepts a live session" do
      session = Factory.insert(:session)
      {:ok, token} = Tokens.generate_refresh_token(session)

      assert {:ok, %Session{id: id}, %{"app" => "app"}} = Sessions.verify_refresh_token(token)
      assert id == session.id
    end

    test "rejects a revoked session" do
      session = Factory.insert(:session, revoked_at: ~U[2026-01-01 00:00:00Z])
      {:ok, token} = Tokens.generate_refresh_token(session)

      assert {:error, :session_revoked} = Sessions.verify_refresh_token(token)
    end

    test "rejects an expired session" do
      session = Factory.insert(:session, expires_at: ~U[2020-01-01 00:00:00Z])
      {:ok, token} = Tokens.generate_refresh_token(session)

      assert {:error, :session_expired} = Sessions.verify_refresh_token(token)
    end

    test "rejects a session that no longer exists" do
      session = Factory.insert(:session)
      {:ok, token} = Tokens.generate_refresh_token(session)
      Repo.delete!(session)

      assert {:error, :session_not_found} = Sessions.verify_refresh_token(token)
    end
  end

  describe "rotate_session/2" do
    test "revokes the old session and opens a new one for the same account" do
      old = Factory.insert(:session)

      assert {:ok, new} = Sessions.rotate_session(old)

      assert new.id != old.id
      assert new.account_id == old.account_id
      assert %DateTime{} = Repo.get!(Session, old.id).revoked_at
      assert Repo.get!(Session, new.id).revoked_at == nil
    end

    test "a second rotation of the same session fails without minting another" do
      old = Factory.insert(:session)

      assert {:ok, _new} = Sessions.rotate_session(old)
      assert {:error, :session_revoked} = Sessions.rotate_session(old)

      assert Repo.aggregate(from(s in Session, where: s.account_id == ^old.account_id), :count) ==
               2
    end

    test "refuses a session already revoked" do
      old = Factory.insert(:session, revoked_at: ~U[2026-01-01 00:00:00Z])

      assert {:error, :session_revoked} = Sessions.rotate_session(old)

      assert Repo.aggregate(from(s in Session, where: s.account_id == ^old.account_id), :count) ==
               1
    end
  end

  test "revoke_all_except keeps only the named live session" do
    account = Factory.insert(:account)
    keep = Factory.insert(:session, account: account)
    other = Factory.insert(:session, account: account)
    stranger = Factory.insert(:session)

    assert {:ok, 1} = Sessions.revoke_all_except(account.id, keep.id)

    assert Repo.get!(Session, keep.id).revoked_at == nil
    assert %DateTime{} = Repo.get!(Session, other.id).revoked_at
    assert Repo.get!(Session, stranger.id).revoked_at == nil
  end
end
