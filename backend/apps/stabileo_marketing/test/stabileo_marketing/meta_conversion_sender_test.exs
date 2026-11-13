defmodule StabileoMarketing.Workers.MetaConversionSenderTest do
  use StabileoMarketing.ConnCase, async: false

  alias StabileoMarketing.Workers.MetaConversionSender

  @event %{"event_name" => "CompleteRegistration", "event_id" => "acc-1"}

  test "posts the events to the pixel's endpoint with the token in the header and the test code" do
    configure(%{"meta_pixel_id" => "123456789", "meta_capi_access_token" => "EAAB-token-0123456789", "meta_capi_test_event_code" => "TEST123"})
    HttpStub.stub([{"graph.facebook.com/v24.0/123456789/events", {:ok, %{"events_received" => 1}}}])

    assert :ok = perform_job(MetaConversionSender, %{"events" => [@event]})

    assert [request] = HttpStub.requests()
    assert request.method == :post
    assert {"Authorization", "Bearer EAAB-token-0123456789"} in request.headers
    assert request.body == %{data: [@event], test_event_code: "TEST123"}
  end

  test "a rejected request is cancelled, a server error retried" do
    configure(%{"meta_pixel_id" => "123456789", "meta_capi_access_token" => "EAAB-token-0123456789"})

    HttpStub.stub([{"events", {:error, {:http_error, 400, "Invalid parameter"}}}])
    assert {:cancel, {:http_error, 400, "Invalid parameter"}} = perform_job(MetaConversionSender, %{"events" => [@event]})

    HttpStub.stub([{"events", {:error, {:http_error, 503, "busy"}}}])
    assert {:error, {:http_error, 503, "busy"}} = perform_job(MetaConversionSender, %{"events" => [@event]})
  end

  test "without credentials the job is cancelled and nothing is sent" do
    assert {:cancel, :not_configured} = perform_job(MetaConversionSender, %{"events" => [@event]})
    assert HttpStub.requests() == []
  end
end
