defmodule StabileoAuth.GoogleOAuthTest do
  use ExUnit.Case, async: true

  test "the applications Assent's httpc client needs are started with the release" do
    applications = Application.spec(:stabileo_auth, :applications)

    assert :inets in applications
    assert :ssl in applications
  end

  test "Assent's httpc client can verify Google's certificate" do
    assert Code.ensure_loaded?(:ssl_verify_hostname)
    assert Code.ensure_loaded?(:certifi)
  end
end
