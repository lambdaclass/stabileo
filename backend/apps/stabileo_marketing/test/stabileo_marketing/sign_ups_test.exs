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
               "attribution" => %{"fbp" => "fb.1.1700000000.123", "fbc" => "fb.1.1700000000.IwAR", "evil" => "x"}
             })

    account = Repo.get_by!(Account, email: "ads1@gmail.com")
    assert payload.account.id == account.id

    source = Repo.get_by!(SignupSource, account_id: account.id)
    assert {source.channel, source.paid, source.utm_campaign, source.trigger} == {"meta", true, "c1", "gate.save"}

    assert [job] = all_enqueued(worker: MetaConversionSender)
    assert [event] = job.args["events"]
    assert event["event_name"] == "CompleteRegistration"
    assert event["event_id"] == account.id
    assert event["action_source"] == "website"
    assert event["event_source_url"] == "http://localhost:4000/app"
    assert event["user_data"]["em"] == Base.encode16(:crypto.hash(:sha256, "ads1@gmail.com"), case: :lower)
    assert event["user_data"]["external_id"] == Base.encode16(:crypto.hash(:sha256, account.id), case: :lower)
    assert event["user_data"]["fbp"] == "fb.1.1700000000.123"
    assert event["user_data"]["client_ip_address"] == "203.0.113.9"
    refute Map.has_key?(event["user_data"], "evil")
    refute inspect(job.args) =~ "EAAB-token"
  end

  test "without the pixel and token nothing is queued, and the account still records a direct visit" do
    assert {:ok, _payload} = sign_up("ads2@gmail.com", %{})
    account = Repo.get_by!(Account, email: "ads2@gmail.com")
    assert Repo.get_by!(SignupSource, account_id: account.id).channel == "direct"
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
    assert {:ok, _} = sign_up("ads4@gmail.com", %{"attribution" => %{"fbp" => "fb.1." <> <<0>>}})
    assert [job] = all_enqueued(worker: MetaConversionSender)
    refute Map.has_key?(hd(job.args["events"])["user_data"], "fbp")
  end
end
