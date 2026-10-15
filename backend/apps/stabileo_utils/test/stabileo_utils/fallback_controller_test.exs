defmodule StabileoUtils.FallbackControllerTest do
  use ExUnit.Case, async: true

  import Plug.Conn
  import Plug.Test

  alias StabileoUtils.FallbackController

  defp call(result) do
    conn = :get |> conn("/") |> put_private(:phoenix_format, "json")
    conn = FallbackController.call(conn, result)
    {conn.status, Jason.decode!(conn.resp_body)}
  end

  defmodule Thing do
    use Ecto.Schema

    embedded_schema do
      field(:name, :string)
      field(:password, :string)
    end
  end

  test "not_found is a 404 with its code" do
    assert {404, %{"error" => "not_found", "message" => "Resource not found"}} =
             call({:error, :not_found})
  end

  test "invalid_credentials is a 401 that does not say which half was wrong" do
    assert {401, %{"error" => "invalid_credentials", "message" => "Invalid email or password"}} =
             call({:error, :invalid_credentials})
  end

  test "invalid_current_password is a 401" do
    assert {401, %{"error" => "invalid_current_password"}} =
             call({:error, :invalid_current_password})
  end

  test "account_disabled is a 403" do
    assert {403, %{"error" => "account_disabled"}} = call({:error, :account_disabled})
  end

  test "a changeset is a 422 with interpolated per-field details" do
    changeset =
      %Thing{}
      |> Ecto.Changeset.cast(%{password: "short"}, [:name, :password])
      |> Ecto.Changeset.validate_required([:name])
      |> Ecto.Changeset.validate_length(:password, min: 8)

    assert {422, body} = call({:error, changeset})
    assert body["error"] == "validation_error"
    assert body["message"] == "Validation failed"
    assert body["details"]["name"] == ["can't be blank"]
    assert body["details"]["password"] == ["should be at least 8 character(s)"]
  end

  test "a bare atom is a 400 with a humanized message" do
    assert {400, %{"error" => "session_expired", "message" => "Session expired"}} =
             call({:error, :session_expired})
  end
end
