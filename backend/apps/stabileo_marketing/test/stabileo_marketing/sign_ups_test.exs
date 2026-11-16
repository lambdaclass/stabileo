defmodule StabileoMarketing.SignUpsTest do
  use StabileoMarketing.ConnCase, async: false

  alias StabileoAuth.UserOAuth
  alias StabileoMarketing.Workers.MetaConversionSender
  alias StabileoRepo.Schemas.{Account, SignupSource}

  @verifier "sign-ups-test-verifier-0123456789abcdefghijk"

  defp sign_up(email, attrs) do
    user = %{"email" => email, "email_verified" => true, "name" => "Ada", "sub" => "g-" <> email}
    {:ok, code} = UserOAuth.sign_in(user, UserOAuth.challenge(@verifier))
    {:ok, %{signup_token: token}} = UserOAuth.exchange(code, @verifier)

    UserOAuth.register(token, Map.merge(%{"accept_terms" => true}, attrs), %{
      ip_address: "203.0.113.9",
      user_agent: "Mozilla/5.0 test"
    })
  end

  test "an account from a Meta ad keeps its source and queues CompleteRegistration with its id" do
    configure(%{"meta_pixel_id" => "123456789", "meta_capi_access_token" => "EAAB-token-0123456789"})

    assert {:ok, payload} =
             sign_up("ads1@gmail.com", %{
               "source" => %{"utm_source" => "ig", "utm_medium" => "paid", "utm_campaign" => "c1", "trigger" => "gate.save", "page" => "/app"},
               "attribution" => %{"consent" => true, "fbp" => "fb.1.1700000000.123", "fbc" => "fb.1.1700000000.IwAR", "evil" => "x"}
             })

    account = Repo.get_by!(Account, email: "ads1@gmail.com")
    assert payload.account.id == account.id

    source = Repo.get_by!(SignupSource, account_id: account.id)
    assert {source.channel, source.paid, source.utm_campaign, source.trigger} == {"meta", true, "c1", "gate.save"}

    assert [job] = all_enqueued(worker: MetaConversionSender)
    assert [event] = job.args["events"]
    assert event["event_name"] == "CompleteRegistration"
    assert event["event_id"] == Base.encode16(:crypto.hash(:sha256, account.id), case: :lower)
    refute inspect(job.args) =~ account.id
    assert event["action_source"] == "website"
    assert event["event_source_url"] == "http://localhost:4000/app"
    assert event["user_data"]["em"] == Base.encode16(:crypto.hash(:sha256, "ads1@gmail.com"), case: :lower)
    assert event["user_data"]["external_id"] == Base.encode16(:crypto.hash(:sha256, account.id), case: :lower)
    assert event["user_data"]["fbp"] == "fb.1.1700000000.123"
    assert event["user_data"]["client_ip_address"] == "203.0.113.9"
    refute Map.has_key?(event["user_data"], "evil")
    refute Map.has_key?(event["user_data"], "consent")
    refute inspect(job.args) =~ "EAAB-token"
  end

  test "without the pixel and token nothing is queued, and the account still records a direct visit" do
    assert {:ok, _payload} = sign_up("ads2@gmail.com", %{})
    account = Repo.get_by!(Account, email: "ads2@gmail.com")
    assert Repo.get_by!(SignupSource, account_id: account.id).channel == "direct"
    assert all_enqueued(worker: MetaConversionSender) == []
  end

  test "without advertising consent the source is kept and nothing goes to Meta" do
    configure(%{"meta_pixel_id" => "123456789", "meta_capi_access_token" => "EAAB-token-0123456789"})

    assert {:ok, _} =
             sign_up("ads5@gmail.com", %{
               "source" => %{"utm_source" => "ig", "utm_medium" => "paid", "utm_campaign" => "c1"},
               "attribution" => %{"fbp" => "fb.1.1700000000.123"}
             })

    account = Repo.get_by!(Account, email: "ads5@gmail.com")
    assert Repo.get_by!(SignupSource, account_id: account.id).utm_campaign == "c1"
    assert all_enqueued(worker: MetaConversionSender) == []
  end

  test "a source that cannot be kept never costs the sign-up" do
    assert {:ok, _payload} = sign_up("ads3@gmail.com", %{"source" => %{"trigger" => String.duplicate("t", 300)}})
    account = Repo.get_by!(Account, email: "ads3@gmail.com")
    assert Repo.get_by!(SignupSource, account_id: account.id).trigger == String.duplicate("t", 255)
    assert Repo.get_by(Account, email: "ads3@gmail.com")
  end

  test "a pixel cookie with a NUL byte is dropped instead of failing the sign-up" do
    configure(%{"meta_pixel_id" => "123456789", "meta_capi_access_token" => "EAAB-token-0123456789"})
    assert {:ok, _} = sign_up("ads4@gmail.com", %{"attribution" => %{"consent" => true, "fbp" => "fb.1." <> <<0>>}})
    assert [job] = all_enqueued(worker: MetaConversionSender)
    refute Map.has_key?(hd(job.args["events"])["user_data"], "fbp")
  end

  test "an unreadable page is left out of the event instead of failing the sign-up" do
    configure(%{"meta_pixel_id" => "123456789", "meta_capi_access_token" => "EAAB-token-0123456789"})
    user = %{"email" => "ads6@gmail.com", "email_verified" => true, "name" => "Ada", "sub" => "g-ads6"}
    {:ok, code} = UserOAuth.sign_in(user, UserOAuth.challenge(@verifier))
    {:ok, %{signup_token: token}} = UserOAuth.exchange(code, @verifier)

    assert {:ok, _} =
             UserOAuth.register(
               token,
               %{"accept_terms" => true, "source" => %{"page" => "/app" <> <<0xFF>>}, "attribution" => %{"consent" => true}},
               %{ip_address: "203.0.113.9", user_agent: "Mozilla/5.0 test"}
             )

    assert Repo.get_by(Account, email: "ads6@gmail.com")
    assert [job] = all_enqueued(worker: MetaConversionSender)
    event = hd(job.args["events"])
    assert event["event_source_url"] == "http://localhost:4000/"
  end

  test "a pixel id that is not a number is treated as not configured" do
    configure(%{"meta_pixel_id" => "123/../../me", "meta_capi_access_token" => "EAAB-token-0123456789"})
    assert StabileoMarketing.Conversions.credentials() == {:error, :not_configured}
    assert {:ok, _} = sign_up("ads7@gmail.com", %{"attribution" => %{"consent" => true}})
    assert all_enqueued(worker: MetaConversionSender) == []
  end
end
