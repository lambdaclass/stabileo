defmodule StabileoMarketing.Controllers.AdminTest do
  use StabileoMarketing.ConnCase, async: false

  alias StabileoRepo.Schemas.SignupSource

  setup do
    admin = Factory.insert(:admin)
    %{token: admin_log_in(admin), admin: admin}
  end

  describe "settings" do
    test "GET shows the tracking ids and whether the Conversions API token is set", %{token: token} do
      configure(%{"meta_pixel_id" => "123456789", "meta_capi_access_token" => "EAAB-capi-token-0123456789"})

      body = admin_request(:get, "/settings", %{}, token) |> json_body(200)

      assert body["data"] == %{
               "meta_pixel_id" => "123456789",
               "gtm_container_id" => nil,
               "meta_capi_access_token" => true,
               "meta_capi_test_event_code" => nil
             }

      refute Jason.encode!(body) =~ "EAAB-capi"
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

    test "422, not a crash, for a period given as lists or maps", %{token: token} do
      for params <- [%{"from" => ["2026-11-01"], "to" => "2026-11-05"}, %{"days" => %{"n" => "7"}}, %{"days" => ["7"]}] do
        body = admin_request(:get, "/acquisition", params, token) |> json_body(422)
        assert body["details"]["period"] == ["must be from and to dates, or days from 1 to 366"]
      end
    end
  end
end
