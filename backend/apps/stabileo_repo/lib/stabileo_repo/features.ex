defmodule StabileoRepo.Features do
  @moduledoc """
  Global feature flags, read from `system_settings` so admins flip them live
  without a redeploy.
  """

  alias StabileoRepo.SystemSettings

  @user_login "user_login_enabled"

  @doc """
  Whether product users may sign up and sign in. Off when the row is unset or
  unreadable: the product starts with sign-in closed.
  """
  def user_login_enabled? do
    SystemSettings.get_flag(@user_login, false) == true
  rescue
    _ -> false
  end

  def set_user_login_enabled(enabled) when is_boolean(enabled) do
    SystemSettings.set_flag(
      @user_login,
      enabled,
      "Product user sign-up and sign-in (existing sessions keep working when off)"
    )
  end
end
