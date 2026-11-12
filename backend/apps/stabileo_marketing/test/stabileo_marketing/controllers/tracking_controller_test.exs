defmodule StabileoMarketing.Controllers.TrackingControllerTest do
  use StabileoMarketing.ConnCase, async: false

  test "GET /tracking answers only the public ids, cacheable, without a session" do
    configure(%{"meta_pixel_id" => "123456789", "gtm_container_id" => "GTM-ABC123", "meta_capi_access_token" => "EAAB-capi-token-0123456789"})
    conn = request(:get, "/tracking")
    assert json_body(conn, 200) == %{"data" => %{"meta_pixel_id" => "123456789", "gtm_container_id" => "GTM-ABC123"}}
    assert get_resp_header(conn, "cache-control") == ["public, max-age=300"]
  end

  test "GET /tracking with nothing saved answers nulls" do
    assert request(:get, "/tracking") |> json_body(200) == %{"data" => %{"meta_pixel_id" => nil, "gtm_container_id" => nil}}
  end
end
