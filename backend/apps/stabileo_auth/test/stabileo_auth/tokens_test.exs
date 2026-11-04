defmodule StabileoAuth.TokensTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoAuth.Tokens
  alias StabileoRepo.Factory

  setup do
    session = Factory.insert(:session)
    account = Repo.get!(StabileoRepo.Schemas.Account, session.account_id)
    %{account: account, session: session}
  end

  test "an access token round-trips its claims", %{account: account, session: session} do
    {:ok, token} = Tokens.generate_access_token(account, session)
    {:ok, claims} = Tokens.verify_access_token(token)

    assert claims["sub"] == account.id
    assert claims["session_id"] == session.id
    assert claims["type"] == "access"
    assert claims["app"] == "app"
    assert claims["exp"] - claims["iat"] == Tokens.access_token_ttl()
  end

  test "a refresh token round-trips and lives longer", %{account: account, session: session} do
    {:ok, token} = Tokens.generate_refresh_token(session)
    {:ok, claims} = Tokens.verify_refresh_token(token)

    assert claims["sub"] == account.id
    assert claims["session_id"] == session.id
    assert claims["exp"] - claims["iat"] == Tokens.refresh_token_ttl()
  end

  test "admin tokens carry their app and the shorter refresh TTL", %{
    account: account,
    session: session
  } do
    {:ok, access} = Tokens.generate_access_token(account, session, "admin")
    {:ok, refresh} = Tokens.generate_refresh_token(session, "admin")

    assert {:ok, %{"app" => "admin"}} = Tokens.verify_access_token(access)
    {:ok, claims} = Tokens.verify_refresh_token(refresh)
    assert claims["app"] == "admin"
    assert claims["exp"] - claims["iat"] == Tokens.refresh_token_ttl("admin")
    assert Tokens.refresh_token_ttl("admin") < Tokens.refresh_token_ttl()
  end

  test "a token of one type is rejected as the other", %{account: account, session: session} do
    {:ok, access} = Tokens.generate_access_token(account, session)
    {:ok, refresh} = Tokens.generate_refresh_token(session)

    assert {:error, :invalid_token_type} = Tokens.verify_refresh_token(access)
    assert {:error, :invalid_token_type} = Tokens.verify_access_token(refresh)
  end

  test "a tampered or foreign-signed token is rejected", %{account: account, session: session} do
    {:ok, token} = Tokens.generate_access_token(account, session)
    [header, payload, _sig] = String.split(token, ".")

    foreign =
      Joken.generate_and_sign!(
        %{},
        %{"sub" => account.id, "type" => "access"},
        Joken.Signer.create("HS256", "another-secret-that-is-long-enough")
      )

    assert {:error, :invalid_token} = Tokens.verify_access_token("#{header}.#{payload}.bad")
    assert {:error, :invalid_token} = Tokens.verify_access_token(foreign)
    assert {:error, :invalid_token} = Tokens.verify_access_token(nil)
  end
end
