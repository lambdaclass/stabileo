defmodule StabileoMarketing.ConfigsTest do
  use StabileoMarketing.ConnCase, async: false

  alias StabileoMarketing.Configs
  alias StabileoRepo.Schemas.MarketingConfig

  @key Jason.encode!(%{"client_email" => "reader@stabileo.iam.gserviceaccount.com", "private_key" => "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n", "private_key_id" => "abcdef0123456789"})

  test "saves the ids trimmed and the secrets encrypted, and keeps a secret sent blank" do
    assert {:ok, _} =
             Configs.update(%{
               "meta_pixel_id" => " 123456789 ",
               "gtm_container_id" => "gtm-abc1234",
               "meta_capi_access_token" => "EAAB-capi-token-0123456789",
               "google_ads_service_account" => @key
             })

    assert Configs.public() == %{meta_pixel_id: "123456789", gtm_container_id: "GTM-ABC1234"}
    assert Configs.meta_capi_access_token() == "EAAB-capi-token-0123456789"

    [raw] = Repo.query!("SELECT meta_capi_access_token FROM marketing_configs").rows |> hd() |> List.wrap()
    refute raw =~ "EAAB-capi-token"

    assert {:ok, _} = Configs.update(%{"meta_capi_access_token" => "  ", "meta_pixel_id" => ""})
    assert Configs.meta_capi_access_token() == "EAAB-capi-token-0123456789"
    assert Configs.meta_pixel_id() == nil

    assert {:ok, _} = Configs.update(%{"meta_capi_access_token" => nil})
    assert Configs.meta_capi_access_token() == nil
  end

  test "the admin view tells which secrets are set with a hint, never the value" do
    {:ok, _} = Configs.update(%{"meta_ads_access_token" => "EAAB-ads-token-0123456789wxyz", "google_ads_service_account" => @key})
    view = Configs.admin_view()

    assert view.secrets.meta_ads_access_token == %{set: true, hint: "…wxyz"}
    assert view.secrets.google_ads_service_account == %{set: true, hint: "reader@stabileo.iam.gserviceaccount.com · abcdef01"}
    assert view.secrets.meta_capi_access_token == %{set: false, hint: nil}
    refute inspect(view) =~ "EAAB-ads-token"
    refute inspect(view) =~ "PRIVATE KEY"
  end

  test "rejects malformed ids and keys, naming the field" do
    assert {:error, changeset} =
             Configs.update(%{
               "meta_pixel_id" => "pixel",
               "gtm_container_id" => "UA-1",
               "meta_ad_account_id" => "12345",
               "google_ads_customer_id" => "12-34",
               "google_ads_service_account" => "{}"
             })

    errors = errors_on(changeset)
    assert errors.meta_pixel_id == ["must be the pixel's numeric id"]
    assert errors.gtm_container_id == ["must look like GTM-XXXXXXX"]
    assert errors.meta_ad_account_id == ["must be the ad account's id, act_ followed by digits"]
    assert errors.google_ads_customer_id == ["must be the customer id, 123-456-7890"]
    assert errors.google_ads_service_account == ["must be the service account's JSON key file"]
    assert Repo.aggregate(MarketingConfig, :count) == 0
  end

  defp errors_on(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {message, _opts} -> message end)
  end
end
