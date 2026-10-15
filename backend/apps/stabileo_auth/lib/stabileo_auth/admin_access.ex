defmodule StabileoAuth.AdminAccess do
  @moduledoc """
  Who is an admin: an account whose email is in the allowlist
  (`config :stabileo_auth, :admin_emails`). Read on every call, so removing an
  email takes effect on the next request.
  """

  alias StabileoRepo.Schemas.Account

  def admin?(%Account{email: email}), do: String.downcase(email) in emails()

  def admin?(_), do: false

  defp emails do
    :stabileo_auth
    |> Application.get_env(:admin_emails, [])
    |> Enum.map(&(&1 |> String.trim() |> String.downcase()))
  end
end
