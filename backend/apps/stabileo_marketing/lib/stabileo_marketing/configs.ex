defmodule StabileoMarketing.Configs do
  @moduledoc "Deploy secrets (`META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, …); a blank one is absent."

  def meta_pixel_id, do: env(:meta_pixel_id)
  def meta_capi_access_token, do: env(:meta_capi_access_token)
  def meta_capi_test_event_code, do: env(:meta_capi_test_event_code)
  def gtm_container_id, do: env(:gtm_container_id)

  def public, do: %{meta_pixel_id: meta_pixel_id(), gtm_container_id: gtm_container_id()}

  def admin_view do
    %{
      meta_pixel_id: meta_pixel_id(),
      gtm_container_id: gtm_container_id(),
      meta_capi_access_token: meta_capi_access_token() != nil,
      meta_capi_test_event_code: meta_capi_test_event_code()
    }
  end

  defp env(key) do
    case Application.get_env(:stabileo_marketing, key) do
      value when is_binary(value) -> if String.trim(value) == "", do: nil, else: String.trim(value)
      _ -> nil
    end
  end
end
