defmodule StabileoAuth.Controllers.PasswordControllerTest do
  use StabileoAuth.ConnCase, async: true

  import Ecto.Query

  alias StabileoRepo.Schemas.Session

  setup do
    account = Factory.insert(:account)
    current = log_in(account)
    other = log_in(account)
    %{account: account, current: current, other: other}
  end

  test "changes the password, keeps this session and revokes the others", ctx do
    body =
      request(
        :put,
        "/password",
        %{"current_password" => Factory.password(), "password" => "brand-new-pass"},
        ctx.current.access_token
      )
      |> json_body(200)

    assert body["message"] == "Password changed"

    assert request(:post, "/login", %{
             "email" => ctx.account.email,
             "password" => "brand-new-pass"
           })
           |> json_body(200)

    assert request(:post, "/refresh", %{"refresh_token" => ctx.current.refresh_token})
           |> json_body(200)

    assert request(:post, "/refresh", %{"refresh_token" => ctx.other.refresh_token})
           |> json_body(401)
  end

  test "401 invalid_current_password and nothing changes", ctx do
    body =
      request(
        :put,
        "/password",
        %{"current_password" => "not-it", "password" => "brand-new-pass"},
        ctx.current.access_token
      )
      |> json_body(401)

    assert body["error"] == "invalid_current_password"
    assert Repo.aggregate(from(s in Session, where: not is_nil(s.revoked_at)), :count) == 0
  end

  test "422 for a short new password", ctx do
    body =
      request(
        :put,
        "/password",
        %{"current_password" => Factory.password(), "password" => "short"},
        ctx.current.access_token
      )
      |> json_body(422)

    assert body["details"]["password"] == ["should be at least 8 character(s)"]
  end

  test "422 when fields are missing", ctx do
    body = request(:put, "/password", %{}, ctx.current.access_token) |> json_body(422)
    assert body["details"]["password"] == ["can't be blank"]
    assert body["details"]["current_password"] == ["can't be blank"]
  end

  test "401 without a token" do
    assert request(:put, "/password", %{"current_password" => "x", "password" => "y"})
           |> json_body(401)
  end
end
