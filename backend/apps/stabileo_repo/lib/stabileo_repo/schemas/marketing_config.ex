defmodule StabileoRepo.Schemas.MarketingConfig do
  @moduledoc """
  The advertising settings an admin keeps in Settings: the Meta pixel and its
  Conversions API token, the GTM container, and the Meta and Google Ads
  accounts the Publicidad report reads with their credentials. One row, under
  `key` "stabileo". The secrets are encrypted at rest and never sent back to a
  browser.
  """

  use StabileoRepo.Schema
  import Ecto.Changeset

  alias StabileoRepo.Encrypted

  @type t :: %__MODULE__{}

  @fields ~w(meta_pixel_id meta_capi_access_token meta_capi_test_event_code gtm_container_id meta_ad_account_id meta_ads_access_token google_ads_customer_id google_ads_login_customer_id google_ads_service_account)a
  @secrets ~w(meta_capi_access_token meta_ads_access_token google_ads_service_account)a
  @customer_id ~r/\A\d{3}-\d{3}-\d{4}\z|\A\d{10}\z/

  schema "marketing_configs" do
    field(:key, :string)
    field(:meta_pixel_id, :string)
    field(:meta_capi_access_token, Encrypted.Binary)
    field(:meta_capi_test_event_code, :string)
    field(:gtm_container_id, :string)
    field(:meta_ad_account_id, :string)
    field(:meta_ads_access_token, Encrypted.Binary)
    field(:google_ads_customer_id, :string)
    field(:google_ads_login_customer_id, :string)
    field(:google_ads_service_account, Encrypted.Binary)

    timestamps()
  end

  def fields, do: @fields
  def secrets, do: @secrets

  def changeset(config, attrs) do
    changeset =
      config
      |> cast(attrs, [:key | @fields])
      |> validate_required([:key])

    (@fields -- @secrets)
    |> Enum.reduce(changeset, &update_change(&2, &1, fn value -> trimmed(value) end))
    |> update_change(:gtm_container_id, &upcase/1)
    |> validate_format(:meta_pixel_id, ~r/\A\d{6,20}\z/,
      message: "must be the pixel's numeric id"
    )
    |> validate_format(:gtm_container_id, ~r/\AGTM-[A-Z0-9]{4,12}\z/,
      message: "must look like GTM-XXXXXXX"
    )
    |> validate_length(:meta_capi_test_event_code, max: 64, count: :codepoints)
    |> validate_format(:meta_ad_account_id, ~r/\Aact_\d{5,20}\z/,
      message: "must be the ad account's id, act_ followed by digits"
    )
    |> validate_format(:google_ads_customer_id, @customer_id,
      message: "must be the customer id, 123-456-7890"
    )
    |> validate_format(:google_ads_login_customer_id, @customer_id,
      message: "must be the manager account's customer id, 123-456-7890"
    )
    |> validate_length(:meta_capi_access_token, max: 2048, count: :codepoints)
    |> validate_length(:meta_ads_access_token, max: 2048, count: :codepoints)
    |> validate_length(:google_ads_service_account, max: 16_384, count: :codepoints)
    |> validate_service_account()
    |> unique_constraint(:key)
  end

  defp validate_service_account(changeset) do
    validate_change(changeset, :google_ads_service_account, fn field, value ->
      case Jason.decode(value) do
        {:ok, %{"client_email" => email, "private_key" => key}}
        when is_binary(email) and is_binary(key) ->
          []

        _ ->
          [{field, "must be the service account's JSON key file"}]
      end
    end)
  end

  defp trimmed(value) when is_binary(value) do
    case String.trim(value) do
      "" -> nil
      text -> text
    end
  end

  defp trimmed(value), do: value

  defp upcase(value), do: value |> trimmed() |> then(&(&1 && String.upcase(&1)))
end
