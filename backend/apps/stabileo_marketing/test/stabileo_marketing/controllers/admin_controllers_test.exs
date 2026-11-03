defmodule StabileoMarketing.Controllers.AdminTest do
  use StabileoMarketing.ConnCase, async: false

  alias StabileoMarketing.Workers.AdsSyncWorker
  alias StabileoRepo.Schemas.{AdminAction, SignupSource}

  setup do
    admin = Factory.insert(:admin)
    %{token: admin_log_in(admin), admin: admin}
  end

  describe "settings" do
    test "GET shows plain fields and secret flags, PUT saves and records which fields changed", %{token: token, admin: admin} do
      body =
        admin_request(
          :put,
          "/settings",
          %{"meta_pixel_id" => "123456789", "meta_capi_access_token" => "EAAB-capi-token-0123456789", "sync_interval_minutes" => 60},
          token
        )
        |> json_body(200)

      data = body["data"]
      assert data["meta_pixel_id"] == "123456789"
      assert data["sync_interval_minutes"] == 60
      assert data["secrets"]["meta_capi_access_token"] == %{"set" => true, "hint" => "…6789"}
      refute Jason.encode!(body) =~ "EAAB-capi"

      action = Repo.one!(from(a in AdminAction, where: a.action == "marketing.update"))
      assert action.admin_id == admin.id
      assert Enum.sort(action.details["fields"]) == ["meta_capi_access_token", "meta_pixel_id", "sync_interval_minutes"]
      refute Jason.encode!(action.details) =~ "EAAB"

      assert admin_request(:get, "/settings", %{}, token) |> json_body(200) == body
    end

    test "PUT answers 422 with the field for a bad value and saves nothing", %{token: token} do
      body = admin_request(:put, "/settings", %{"gtm_container_id" => "UA-1"}, token) |> json_body(422)
      assert body["details"]["gtm_container_id"] == ["must look like GTM-XXXXXXX"]

      body = admin_request(:put, "/settings", %{"sync_interval_minutes" => 1}, token) |> json_body(422)
      assert body["details"]["interval_minutes"] == ["must be a whole number from 5 to 1440"]
      assert Repo.aggregate(AdminAction, :count) == 0
    end

    test "401 without a session and 401 for a product session" do
      assert admin_request(:get, "/settings") |> json_body(401) |> Map.has_key?("error")
      user = Factory.insert(:account)
      assert admin_request(:get, "/settings", %{}, log_in(user)) |> json_body(401) |> Map.has_key?("error")
    end
  end

  describe "acquisition" do
    test "counts the period's accounts by channel and trigger", %{token: token} do
      account = Factory.insert(:account)
      Repo.insert!(%SignupSource{account_id: account.id, channel: "google", paid: true, trigger: "gate.save", utm_campaign: "77"})

      data = admin_request(:get, "/acquisition", %{"days" => "7"}, token) |> json_body(200) |> Map.fetch!("data")
      assert %{"channel" => "google", "accounts" => 1, "paid" => 1} = Enum.find(data["channels"], &(&1["channel"] == "google"))
      assert Enum.any?(data["triggers"], &(&1["trigger"] == "gate.save" and &1["accounts"] == 1))
      assert [%{"campaign" => "77", "channel" => "google", "accounts" => 1}] = data["campaigns"]
      assert length(data["daily"]) == 7
    end

    test "422 for a bad period", %{token: token} do
      body = admin_request(:get, "/acquisition", %{"from" => "2026-11-05", "to" => "2026-11-01"}, token) |> json_body(422)
      assert body["details"]["period"] == ["must be from and to dates, or days from 1 to 366"]
    end
  end

  describe "ads" do
    test "overview with nothing saved is empty, sync queues each saved account once", %{token: token} do
      data = admin_request(:get, "/ads/overview", %{"days" => "30", "display" => "ARS"}, token) |> json_body(200) |> Map.fetch!("data")
      assert data["accounts"] == []
      assert data["tree"] == []
      assert data["display"] == "ARS"

      configure(%{"meta_ad_account_id" => "act_1234567", "google_ads_customer_id" => "123-456-7890"})
      assert admin_request(:post, "/ads/sync", %{}, token) |> json_body(202) == %{"data" => %{"queued" => 2}}
      admin_request(:post, "/ads/sync", %{}, token)
      assert length(all_enqueued(worker: AdsSyncWorker)) == 2
    end

    test "422 for an unknown channel or currency", %{token: token} do
      body = admin_request(:get, "/ads/overview", %{"channel" => "tiktok"}, token) |> json_body(422)
      assert body["details"]["channel"] == ["must be one of all, meta, google"]
      body = admin_request(:get, "/ads/overview", %{"display" => "EUR"}, token) |> json_body(422)
      assert body["details"]["display"] == ["must be one of USD, ARS"]
    end

    test "connections report each saved account's steps", %{token: token} do
      configure(%{"meta_ad_account_id" => "act_1234567"})
      [report] = admin_request(:get, "/ads/connections", %{}, token) |> json_body(200) |> Map.fetch!("data")
      assert report["channel"] == "meta"
      assert report["ok"] == false
      assert hd(report["steps"]) == %{"key" => "credentials", "status" => "error", "detail" => nil}
    end
  end
end
