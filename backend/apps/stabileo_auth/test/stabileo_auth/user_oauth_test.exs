defmodule StabileoAuth.UserOAuthTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoAuth.{Sessions, UserOAuth}
  alias StabileoRepo.{Factory, Features}
  alias StabileoRepo.Schemas.{Account, Consent, Session}

  @verifier "this-browser-attempt-secret-0123456789abcdef"
  @attempt UserOAuth.challenge(@verifier)

  defp google(attrs \\ %{}) do
    Map.merge(
      %{
        "email" => "Person@Gmail.com",
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
    {:ok, code} = UserOAuth.sign_in(user, @attempt)
    {:ok, %{signup_required: true, signup_token: token}} = UserOAuth.exchange(code, @verifier)
    token
  end

  describe "someone new" do
    test "the code trades for a sign-up token with what Google said, and nothing is written" do
      before = Repo.aggregate(Account, :count)
      assert {:ok, code} = UserOAuth.sign_in(google(), @attempt)

      assert {:ok, answer} = UserOAuth.exchange(code, @verifier)
      assert answer.signup_required == true
      assert answer.email == "person@gmail.com"
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

      account = Repo.get_by!(Account, email: "person@gmail.com")
      assert payload.account.id == account.id
      assert payload.account.consents.terms_current == true
      assert payload.account.consents.usage_analytics == true
      assert payload.account.consents.model_research == true
      assert account.google_subject == "g-person"
      assert account.password_hash == nil
      assert account.locale == "en"
      assert %DateTime{} = account.email_verified_at
      assert %DateTime{} = account.last_sign_in_at
      assert Repo.aggregate(from(c in Consent, where: c.account_id == ^account.id), :count) == 3
      assert is_binary(payload.access_token) and is_binary(payload.refresh_token)
    end

    test "the terms alone leave usage and project research on, recorded at sign-up" do
      {:ok, payload} = UserOAuth.register(signup_token(), %{"accept_terms" => true})
      account = Repo.get_by!(Account, email: "person@gmail.com")

      assert payload.account.consents.usage_analytics == true
      assert payload.account.consents.model_research == true

      kinds =
        from(c in Consent, where: c.account_id == ^account.id, select: {c.kind, c.granted})
        |> Repo.all()
        |> Enum.sort()

      assert kinds == [{"model_research", true}, {"terms", true}, {"usage_analytics", true}]
    end

    test "a sign-up that turns usage off records it off" do
      {:ok, payload} =
        UserOAuth.register(signup_token(), %{"accept_terms" => true, "usage_analytics" => false})

      assert payload.account.consents.usage_analytics == false
      assert payload.account.consents.model_research == true
    end

    test "without the terms nothing is created" do
      token = signup_token()

      assert {:error, {:validation, %{accept_terms: ["must be accepted"]}}} =
               UserOAuth.register(token, %{"accept_terms" => false})

      assert Repo.get_by(Account, email: "person@gmail.com") == nil
    end

    test "the same sign-up token cannot open a second account" do
      token = signup_token()
      assert {:ok, _} = UserOAuth.register(token, %{"accept_terms" => true})

      assert {:error, changeset} = UserOAuth.register(token, %{"accept_terms" => true})
      errors = errors_on(changeset)

      assert errors[:email] == ["has already been taken"] or
               errors[:google_subject] == ["has already been taken"]

      assert Repo.aggregate(from(a in Account, where: a.email == "person@gmail.com"), :count) ==
               1
    end

    test "the sign-up token lasts its own 15 minutes and does not carry the attempt" do
      {:ok, claims} = Joken.peek_claims(signup_token())
      assert claims["exp"] - claims["iat"] == 900
      assert claims["type"] == "user_signup"
      refute Map.has_key?(claims, "attempt")
    end

    test "an address Google does not answer for still opens a new account" do
      user = google(%{"email" => "eng@studio.example", "sub" => "g-studio"})
      {:ok, payload} = UserOAuth.register(signup_token(user), %{"accept_terms" => true})
      assert payload.account.email == "eng@studio.example"
      assert Repo.get_by!(Account, email: "eng@studio.example").google_subject == "g-studio"
    end

    test "a callback code is not a sign-up token" do
      {:ok, code} = UserOAuth.sign_in(google(), @attempt)

      assert {:error, :invalid_or_expired_code} =
               UserOAuth.register(code, %{"accept_terms" => true})
    end
  end

  describe "a known person" do
    test "is found by Google's subject, even after the email changed at Google" do
      account =
        Factory.insert(:account, email: "old@gmail.com")
        |> Ecto.Changeset.change(google_subject: "g-person")
        |> Repo.update!()

      {:ok, code} = UserOAuth.sign_in(google(%{"email" => "new@gmail.com"}), @attempt)
      assert {:ok, payload} = UserOAuth.exchange(code, @verifier)
      assert payload.account.id == account.id
      assert payload.account.email == "old@gmail.com"
    end

    test "the code opens one session and works once" do
      account = Factory.insert(:account, email: "person@gmail.com")
      {:ok, code} = UserOAuth.sign_in(google(), @attempt)

      assert {:ok, payload} = UserOAuth.exchange(code, @verifier)
      assert payload.account.email == "person@gmail.com"

      live =
        from(s in Session, where: s.account_id == ^account.id and is_nil(s.revoked_at))
        |> Repo.aggregate(:count)

      assert live == 1
      assert {:error, :invalid_or_expired_code} = UserOAuth.exchange(code, @verifier)
    end

    test "a verified account found by email takes the subject and keeps its sessions" do
      account =
        Factory.insert(:account, email: "person@gmail.com")
        |> Ecto.Changeset.change(
          email_verified_at: DateTime.utc_now() |> DateTime.truncate(:second)
        )
        |> Repo.update!()

      {:ok, earlier} = Sessions.create_session(account)

      assert {:ok, _code} = UserOAuth.sign_in(google(), @attempt)

      saved = Repo.get!(Account, account.id)
      assert saved.google_subject == "g-person"
      assert Repo.get!(Session, earlier.id).revoked_at == nil
    end

    test "an account nobody verified loses its password and its sessions to the Google owner" do
      account = Factory.insert(:account, email: "person@gmail.com")
      {:ok, earlier} = Sessions.create_session(account)

      assert {:ok, _code} = UserOAuth.sign_in(google(), @attempt)

      saved = Repo.get!(Account, account.id)
      assert saved.google_subject == "g-person"
      assert saved.password_hash == nil
      assert %DateTime{} = saved.email_verified_at
      refute Account.valid_password?(saved, Factory.password())
      assert %DateTime{} = Repo.get!(Session, earlier.id).revoked_at
    end

    test "an email already tied to another Google subject is refused" do
      Factory.insert(:account, email: "person@gmail.com")
      |> Ecto.Changeset.change(google_subject: "g-someone-else")
      |> Repo.update!()

      assert {:error, :callback_failed} = UserOAuth.sign_in(google(), @attempt)
    end

    test "a disabled account is refused" do
      Factory.insert(:account, email: "person@gmail.com", is_active: false)
      assert {:error, :account_disabled} = UserOAuth.sign_in(google(), @attempt)
    end
  end

  describe "linking by email" do
    test "a Workspace address, with Google's hd, takes the subject" do
      account = Factory.insert(:account, email: "eng@studio.example")

      user =
        google(%{"email" => "eng@studio.example", "hd" => "studio.example", "sub" => "g-ws"})

      {:ok, code} = UserOAuth.sign_in(user, @attempt)
      assert {:ok, payload} = UserOAuth.exchange(code, @verifier)
      assert payload.account.id == account.id
      assert Repo.get!(Account, account.id).google_subject == "g-ws"
    end

    test "any other address is refused and the account stays as it was" do
      account =
        Factory.insert(:account, email: "eng@studio.example")
        |> Ecto.Changeset.change(
          email_verified_at: DateTime.utc_now() |> DateTime.truncate(:second)
        )
        |> Repo.update!()

      unverified = Factory.insert(:account, email: "other@studio.example")
      {:ok, earlier} = Sessions.create_session(unverified)

      for {email, sub} <- [{"eng@studio.example", "g-a"}, {"other@studio.example", "g-b"}] do
        assert {:error, :email_in_use} =
                 UserOAuth.sign_in(google(%{"email" => email, "sub" => sub}), @attempt)
      end

      assert {:error, :email_in_use} =
               UserOAuth.sign_in(
                 google(%{"email" => "eng@studio.example", "hd" => "other.example"}),
                 @attempt
               )

      assert Repo.get!(Account, account.id).google_subject == nil
      kept = Repo.get!(Account, unverified.id)
      assert kept.google_subject == nil
      assert Account.valid_password?(kept, Factory.password())
      assert Repo.get!(Session, earlier.id).revoked_at == nil
    end

    test "once linked, the subject finds the account whatever the address" do
      account =
        Factory.insert(:account, email: "eng@studio.example")
        |> Ecto.Changeset.change(google_subject: "g-ws")
        |> Repo.update!()

      {:ok, code} =
        UserOAuth.sign_in(google(%{"email" => "eng@studio.example", "sub" => "g-ws"}), @attempt)

      assert {:ok, payload} = UserOAuth.exchange(code, @verifier)
      assert payload.account.id == account.id
    end
  end

  describe "the attempt" do
    test "a code trades only with the verifier of the attempt that asked for it" do
      account = Factory.insert(:account, email: "person@gmail.com")
      {:ok, code} = UserOAuth.sign_in(google(), @attempt)

      for verifier <- ["another-tab-or-browser-secret-0123456789ab", nil, ""] do
        assert {:error, :invalid_or_expired_code} = UserOAuth.exchange(code, verifier)
      end

      assert {:ok, payload} = UserOAuth.exchange(code, @verifier)
      assert payload.account.id == account.id
    end

    test "someone new: another attempt's verifier gets no sign-up token" do
      {:ok, code} = UserOAuth.sign_in(google(), @attempt)

      assert {:error, :invalid_or_expired_code} =
               UserOAuth.exchange(code, "another-tab-or-browser-secret-0123456789ab")
    end

    test "a sign-in without a well-formed attempt is refused" do
      for attempt <- [nil, "", "short", String.duplicate("a", 43) <> "!"] do
        assert {:error, :invalid_state} = UserOAuth.sign_in(google(), attempt)
      end
    end
  end

  describe "refused" do
    test "an email Google did not verify" do
      assert {:error, :email_not_verified} =
               UserOAuth.sign_in(google(%{"email_verified" => false}), @attempt)
    end

    test "no subject or no email" do
      assert {:error, :callback_failed} = UserOAuth.sign_in(google(%{"sub" => nil}), @attempt)
      assert {:error, :callback_failed} = UserOAuth.sign_in(google(%{"email" => ""}), @attempt)
    end

    test "while user sign-in is off" do
      {:ok, _} = Features.set_user_login_enabled(false)
      assert {:error, :user_login_disabled} = UserOAuth.sign_in(google(), @attempt)
    end

    test "a forged or garbage code" do
      assert {:error, :invalid_or_expired_code} = UserOAuth.exchange("not-a-token", @verifier)
      assert {:error, :invalid_or_expired_code} = UserOAuth.exchange(nil, @verifier)
    end
  end
end
