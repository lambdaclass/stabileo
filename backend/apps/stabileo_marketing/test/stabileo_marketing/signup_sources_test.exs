defmodule StabileoMarketing.SignupSourcesTest do
  use StabileoMarketing.ConnCase, async: true

  alias StabileoMarketing.SignupSources
  alias StabileoRepo.Schemas.SignupSource

  defp classify(captured), do: captured |> SignupSources.normalize() |> SignupSources.classify()

  describe "classify/1" do
    test "a Google click id is a paid Google visit, placed by its network" do
      assert classify(%{"gclid" => "abc", "network" => "g"}) == %{channel: "google", paid: true, placement: "search"}
      assert classify(%{"gbraid" => "x"}).channel == "google"
    end

    test "Meta ads tagged as paid, and a bare fbclid whose payment is unknown" do
      assert classify(%{"utm_source" => "ig", "utm_medium" => "paid"}) == %{channel: "meta", paid: true, placement: "instagram"}
      assert classify(%{"fbclid" => "IwAR", "referrer" => "l.instagram.com"}) == %{channel: "meta", paid: nil, placement: "instagram"}
    end

    test "organic search, social, email, referral and direct" do
      assert classify(%{"referrer" => "www.google.com"}) == %{channel: "search", paid: false, placement: "google"}
      assert classify(%{"referrer" => "linkedin.com"}) == %{channel: "social", paid: false, placement: "linkedin"}
      assert classify(%{"utm_medium" => "newsletter", "utm_source" => "fiuba"}).channel == "email"
      assert classify(%{"referrer" => "campus.fi.uba.ar"}) == %{channel: "referral", paid: false, placement: "campus.fi.uba.ar"}
      assert classify(%{}) == %{channel: "direct", paid: nil, placement: nil}
    end
  end

  describe "record/2" do
    test "keeps the tags, the trigger and the first visit, cut and cleaned" do
      account = Factory.insert(:account)

      assert {:ok, source} =
               SignupSources.record(account, %{
                 "utm_source" => "facebook",
                 "utm_medium" => "paid",
                 "utm_campaign" => "120210000",
                 "utm_content" => "120230000",
                 "utm_term" => " 120220000 ",
                 "landing" => "/es/register/",
                 "trigger" => "register.hero",
                 "first_seen" => "2026-11-01T12:30:00Z",
                 "fbclid" => "IwAR" <> <<0>> <> String.duplicate("x", 400)
               })

      saved = Repo.get!(SignupSource, source.id)
      assert saved.account_id == account.id
      assert saved.channel == "meta"
      assert saved.paid == true
      assert saved.placement == "facebook"
      assert saved.utm_term == "120220000"
      assert saved.landing_path == "/es/register/"
      assert saved.trigger == "register.hero"
      assert saved.first_seen_at == ~U[2026-11-01 12:30:00Z]
      assert String.length(saved.fbclid) == 255
      refute String.contains?(saved.fbclid, <<0>>)
    end

    test "anything but a map is a direct visit" do
      account = Factory.insert(:account)
      assert {:ok, source} = SignupSources.record(account, "garbage")
      assert Repo.get!(SignupSource, source.id).channel == "direct"
    end
  end
end
