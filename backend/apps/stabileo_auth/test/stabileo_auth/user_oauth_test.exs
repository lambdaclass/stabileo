defmodule StabileoAuth.UserOAuthTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoAuth.{Sessions, UserOAuth}
  alias StabileoRepo.{Factory, Features}
  alias StabileoRepo.Schemas.{Account, Consent, Session}

  defp google(attrs \\ %{}) do
    Map.merge(
      %{
        "email" => "Person@Gmail.test",
        "email_verified" => true,
        "name" => "Person",
        "sub" => "g-person"
      },
      attrs
    )
  end

  setup do
    {:ok, _} = Features.set_user_login_enabled(true)
    :ok
  end

  defp signup_token(user \\ google()) do
    {:ok, code} = UserOAuth.sign_in(user)
    {:ok, %{signup_required: true, signup_token: token}} = UserOAuth.exchange(code)
    token
  end

  describe "someone new" do
    test "the code trades for a sign-up token with what Google said, and nothing is written" do
      before = Repo.aggregate(Account, :count)
      assert {:ok, code} = UserOAuth.sign_in(google())

      assert {:ok, answer} = UserOAuth.exchange(code)
      assert answer.signup_required == true
      assert answer.email == "person@gmail.test"
      assert answer.name == "Person"
      assert is_binary(answer.signup_token)
      assert Repo.aggregate(Account, :count) == before
    end

    test "accepting the terms opens a verified Google account with no password" do
      token = signup_token()

      assert {:ok, payload} =
               UserOAuth.register(token, %{
                 "accept_terms" => true,
                 "usage_analytics" => true,
                 "locale" => "en"
               })

      account = Repo.get_by!(Account, email: "person@gmail.test")
      assert payload.account.id == account.id
      assert payload.account.consents.terms_current == true
      assert payload.account.consents.usage_analytics == true
      assert account.google_subject == "g-person"
      assert account.password_hash == nil
      assert account.locale == "en"
      assert %DateTime{} = account.email_verified_at
      assert %DateTime{} = account.last_sign_in_at
      assert Repo.aggregate(from(c in Consent, where: c.account_id == ^account.id), :count) == 2
      assert is_binary(payload.access_token) and is_binary(payload.refresh_token)
    end

    test "without the terms nothing is created" do
      token = signup_token()

      assert {:error, {:validation, %{accept_terms: ["must be accepted"]}}} =
               UserOAuth.register(token, %{"accept_terms" => false})

      assert Repo.get_by(Account, email: "person@gmail.test") == nil
    end

    test "the same sign-up token cannot open a second account" do
      token = signup_token()
      assert {:ok, _} = UserOAuth.register(token, %{"accept_terms" => true})

      assert {:error, changeset} = UserOAuth.register(token, %{"accept_terms" => true})
      errors = errors_on(changeset)

      assert errors[:email] == ["has already been taken"] or
               errors[:google_subject] == ["has already been taken"]

      assert Repo.aggregate(from(a in Account, where: a.email == "person@gmail.test"), :count) ==
               1
    end

    test "a callback code is not a sign-up token" do
      {:ok, code} = UserOAuth.sign_in(google())

      assert {:error, :invalid_or_expired_code} =
               UserOAuth.register(code, %{"accept_terms" => true})
    end
  end

  describe "a known person" do
    test "is found by Google's subject, even after the email changed at Google" do
      account =
        Factory.insert(:account, email: "old@gmail.test")
        |> Ecto.Changeset.change(google_subject: "g-person")
        |> Repo.update!()

      {:ok, code} = UserOAuth.sign_in(google(%{"email" => "new@gmail.test"}))
      assert {:ok, payload} = UserOAuth.exchange(code)
      assert payload.account.id == account.id
      assert payload.account.email == "old@gmail.test"
    end

    test "the code opens one session and works once" do
      account = Factory.insert(:account, email: "person@gmail.test")
      {:ok, code} = UserOAuth.sign_in(google())

      assert {:ok, payload} = UserOAuth.exchange(code)
      assert payload.account.email == "person@gmail.test"

      live =
        from(s in Session, where: s.account_id == ^account.id and is_nil(s.revoked_at))
        |> Repo.aggregate(:count)

      assert live == 1
      assert {:error, :invalid_or_expired_code} = UserOAuth.exchange(code)
    end

    test "a verified account found by email takes the subject and keeps its sessions" do
      account =
        Factory.insert(:account, email: "person@gmail.test")
        |> Ecto.Changeset.change(
          email_verified_at: DateTime.utc_now() |> DateTime.truncate(:second)
        )
        |> Repo.update!()

      {:ok, earlier} = Sessions.create_session(account)

      assert {:ok, _code} = UserOAuth.sign_in(google())

      saved = Repo.get!(Account, account.id)
      assert saved.google_subject == "g-person"
      assert Repo.get!(Session, earlier.id).revoked_at == nil
    end

    test "an account nobody verified loses its password and its sessions to the Google owner" do
      account = Factory.insert(:account, email: "person@gmail.test")
      {:ok, earlier} = Sessions.create_session(account)

      assert {:ok, _code} = UserOAuth.sign_in(google())

      saved = Repo.get!(Account, account.id)
      assert saved.google_subject == "g-person"
      assert saved.password_hash == nil
      assert %DateTime{} = saved.email_verified_at
      refute Account.valid_password?(saved, Factory.password())
      assert %DateTime{} = Repo.get!(Session, earlier.id).revoked_at
    end

    test "an email already tied to another Google subject is refused" do
      Factory.insert(:account, email: "person@gmail.test")
      |> Ecto.Changeset.change(google_subject: "g-someone-else")
      |> Repo.update!()

      assert {:error, :callback_failed} = UserOAuth.sign_in(google())
    end

    test "a disabled account is refused" do
      Factory.insert(:account, email: "person@gmail.test", is_active: false)
      assert {:error, :account_disabled} = UserOAuth.sign_in(google())
    end
  end

  describe "refused" do
    test "an email Google did not verify" do
      assert {:error, :email_not_verified} =
               UserOAuth.sign_in(google(%{"email_verified" => false}))
    end

    test "no subject or no email" do
      assert {:error, :callback_failed} = UserOAuth.sign_in(google(%{"sub" => nil}))
      assert {:error, :callback_failed} = UserOAuth.sign_in(google(%{"email" => ""}))
    end

    test "while user sign-in is off" do
      {:ok, _} = Features.set_user_login_enabled(false)
      assert {:error, :user_login_disabled} = UserOAuth.sign_in(google())
    end

    test "a forged or garbage code" do
      assert {:error, :invalid_or_expired_code} = UserOAuth.exchange("not-a-token")
      assert {:error, :invalid_or_expired_code} = UserOAuth.exchange(nil)
    end
  end
end
