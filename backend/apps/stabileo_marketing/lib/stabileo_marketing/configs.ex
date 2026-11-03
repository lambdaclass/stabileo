defmodule StabileoMarketing.Configs do
  @moduledoc """
  The advertising settings admins keep in Settings (`MarketingConfig`, one
  row). They are the only source of the pixel, the Conversions API token, the
  GTM container and the ad accounts: nothing here reads the environment, and a
  value that is not stored is absent.
  """

  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.MarketingConfig

  @key "stabileo"
  @hint_min_length 16

  def get, do: Repo.get_by(MarketingConfig, key: @key)

  @doc """
  Saves `attrs` (the admin API's names). A secret sent blank or left out
  keeps the stored one; an explicit nil clears it. Any other field sent blank
  clears.
  """
  def update(attrs) when is_map(attrs) do
    secrets = Enum.map(MarketingConfig.secrets(), &to_string/1)

    attrs =
      attrs
      |> Map.new(fn {key, value} -> {to_string(key), value} end)
      |> Map.take(Enum.map(MarketingConfig.fields(), &to_string/1))
      |> Map.reject(fn {key, value} -> key in secrets and blank?(value) end)
      |> Map.put("key", @key)

    upsert(attrs, true)
  end

  defp upsert(attrs, retry?) do
    (get() || %MarketingConfig{})
    |> MarketingConfig.changeset(attrs)
    |> Repo.insert_or_update()
    |> case do
      {:error, %Ecto.Changeset{errors: errors} = changeset} ->
        if retry? and Keyword.has_key?(errors, :key),
          do: upsert(attrs, false),
          else: {:error, changeset}

      ok ->
        ok
    end
  end

  defp blank?(value), do: is_binary(value) and String.trim(value) == ""

  @doc "What a browser may know: the pixel and GTM ids it loads."
  def public do
    config = get()
    %{meta_pixel_id: value(config, :meta_pixel_id), gtm_container_id: value(config, :gtm_container_id)}
  end

  @doc "The settings for the admin: plain fields, and for each secret whether it is set and a hint."
  def admin_view do
    config = get()

    plain =
      Map.new(MarketingConfig.fields() -- MarketingConfig.secrets(), &{&1, value(config, &1)})

    secrets =
      Map.new(MarketingConfig.secrets(), fn field ->
        stored = value(config, field)
        {field, %{set: stored != nil, hint: hint(field, stored)}}
      end)

    Map.put(plain, :secrets, secrets)
  end

  def hint(:google_ads_service_account, json) when is_binary(json) do
    case Jason.decode(json) do
      {:ok, %{"client_email" => email, "private_key_id" => id}}
      when is_binary(email) and is_binary(id) and id != "" ->
        "#{email} · #{String.slice(id, 0, 8)}"

      {:ok, %{"client_email" => email}} when is_binary(email) ->
        email

      _ ->
        nil
    end
  end

  def hint(_field, value) when is_binary(value) do
    if String.length(value) >= @hint_min_length, do: "…" <> String.slice(value, -4, 4)
  end

  def hint(_field, _value), do: nil

  def meta_pixel_id, do: value(get(), :meta_pixel_id)
  def meta_capi_access_token, do: value(get(), :meta_capi_access_token)
  def meta_capi_test_event_code, do: value(get(), :meta_capi_test_event_code)
  def meta_ad_account_id, do: value(get(), :meta_ad_account_id)
  def meta_ads_access_token, do: value(get(), :meta_ads_access_token)
  def google_ads_customer_id, do: value(get(), :google_ads_customer_id)
  def google_ads_login_customer_id, do: value(get(), :google_ads_login_customer_id)
  def google_ads_service_account, do: value(get(), :google_ads_service_account)

  defp value(nil, _field), do: nil

  defp value(config, field) do
    case Map.get(config, field) do
      text when is_binary(text) and text != "" -> text
      _ -> nil
    end
  end
end
