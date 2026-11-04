defmodule StabileoUtils.FallbackController do
  @moduledoc """
  Translates controller action results into JSON responses. The fallback
  controller for every API controller in the umbrella.
  """

  use StabileoUtils.Controller

  import Plug.Conn

  def call(conn, {:error, :not_found}) do
    error(conn, :not_found, "not_found", "Resource not found")
  end

  def call(conn, {:error, :unauthorized}) do
    error(conn, :unauthorized, "unauthorized", "Authentication required")
  end

  def call(conn, {:error, :forbidden}) do
    error(conn, :forbidden, "forbidden", "Permission denied")
  end

  def call(conn, {:error, :invalid_credentials}) do
    error(conn, :unauthorized, "invalid_credentials", "Invalid email or password")
  end

  def call(conn, {:error, :invalid_current_password}) do
    error(conn, :unauthorized, "invalid_current_password", "Current password is incorrect")
  end

  def call(conn, {:error, :account_disabled}) do
    error(conn, :forbidden, "account_disabled", "Account is disabled")
  end

  def call(conn, {:error, :user_login_disabled}) do
    error(conn, :forbidden, "user_login_disabled", "Sign-in is currently disabled")
  end

  def call(conn, {:error, :cannot_remove_self}) do
    error(conn, :unprocessable_entity, "cannot_remove_self", "You cannot remove your own email")
  end

  def call(conn, {:error, :cannot_disable_self}) do
    error(
      conn,
      :unprocessable_entity,
      "cannot_disable_self",
      "You cannot disable your own account"
    )
  end

  def call(conn, {:error, %Ecto.Changeset{} = changeset}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{
      error: "validation_error",
      message: "Validation failed",
      details: format_changeset_errors(changeset)
    })
  end

  def call(conn, {:error, {:validation, errors}}) when is_map(errors) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(%{error: "validation_error", message: "Validation failed", details: errors})
  end

  def call(conn, {:error, {:bad_request, message}}) when is_binary(message) do
    error(conn, :bad_request, "bad_request", message)
  end

  def call(conn, {:error, {:conflict, message}}) when is_binary(message) do
    error(conn, :conflict, "conflict", message)
  end

  def call(conn, {:error, reason}) when is_atom(reason) do
    error(conn, :bad_request, to_string(reason), humanize(reason))
  end

  defp error(conn, status, code, message) do
    conn
    |> put_status(status)
    |> json(%{error: code, message: message})
  end

  defp format_changeset_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
      end)
    end)
  end

  defp humanize(reason) do
    reason
    |> to_string()
    |> String.replace("_", " ")
    |> String.capitalize()
  end
end
