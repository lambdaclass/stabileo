defmodule StabileoRepo.Schemas.MarketingConfigTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.Schemas.MarketingConfig

  test "inserts, encrypts the secrets at rest and reads them back" do
    attrs = %{
      key: "stabileo",
      meta_pixel_id: "123456789",
      meta_ads_access_token: "EAAB-secret-0123456789"
    }

    assert {:ok, config} = %MarketingConfig{} |> MarketingConfig.changeset(attrs) |> Repo.insert()
    assert Repo.get!(MarketingConfig, config.id).meta_ads_access_token == "EAAB-secret-0123456789"

    %{rows: [[stored]]} = Repo.query!("SELECT meta_ads_access_token FROM marketing_configs")
    refute stored =~ "EAAB-secret"
  end

  test "requires key" do
    assert %{key: ["can't be blank"]} =
             errors_on(
               MarketingConfig.changeset(%MarketingConfig{}, %{meta_pixel_id: "123456789"})
             )
  end

  test "one row per key" do
    {:ok, _} =
      %MarketingConfig{} |> MarketingConfig.changeset(%{key: "stabileo"}) |> Repo.insert()

    assert {:error, changeset} =
             %MarketingConfig{} |> MarketingConfig.changeset(%{key: "stabileo"}) |> Repo.insert()

    assert %{key: ["has already been taken"]} = errors_on(changeset)
  end
end
