defmodule StabileoMarketing.ConfigsTest do
  use StabileoMarketing.ConnCase, async: false

  alias StabileoMarketing.Configs

  test "reads the deploy secrets, trimmed, and treats a blank one as absent" do
    configure(%{
      "meta_pixel_id" => " 123456789 ",
      "gtm_container_id" => "GTM-ABC1234",
      "meta_capi_access_token" => "EAAB-capi-token-0123456789",
      "meta_capi_test_event_code" => "  "
    })

    assert Configs.public() == %{meta_pixel_id: "123456789", gtm_container_id: "GTM-ABC1234"}
    assert Configs.meta_capi_access_token() == "EAAB-capi-token-0123456789"
    assert Configs.meta_capi_test_event_code() == nil
  end

  test "the admin sees whether the token is set, never the token" do
    configure(%{"meta_pixel_id" => "123456789", "meta_capi_access_token" => "EAAB-capi-token-0123456789"})

    view = Configs.admin_view()

    assert view == %{
             meta_pixel_id: "123456789",
             gtm_container_id: nil,
             meta_capi_access_token: true,
             meta_capi_test_event_code: nil
           }

    refute Jason.encode!(view) =~ "EAAB"
  end

  test "nothing configured" do
    assert Configs.public() == %{meta_pixel_id: nil, gtm_container_id: nil}
    assert Configs.admin_view().meta_capi_access_token == false
  end
end
