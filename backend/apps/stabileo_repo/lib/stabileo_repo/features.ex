defmodule StabileoRepo.Features do
  @moduledoc """
  Global feature flags, read from `system_settings` so admins flip them live
  without a redeploy.
  """

  alias StabileoRepo.SystemSettings

  @user_login "user_login_enabled"
  @usage_telemetry "usage_telemetry_enabled"
  @cloud_projects "cloud_projects_enabled"
  @save_requires_account "save_requires_account"

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

  @doc """
  Whether anonymous usage events are stored. Users still choose whether their
  browser sends them; this is the server-side switch, off when unset.
  """
  def usage_telemetry_enabled? do
    SystemSettings.get_flag(@usage_telemetry, false) == true
  rescue
    _ -> false
  end

  def set_usage_telemetry_enabled(enabled) when is_boolean(enabled) do
    SystemSettings.set_flag(
      @usage_telemetry,
      enabled,
      "Store anonymous usage events from browsers whose users opted in"
    )
  end

  @doc "Whether signed-in users may save projects to the cloud. Off when unset."
  def cloud_projects_enabled? do
    SystemSettings.get_flag(@cloud_projects, false) == true
  rescue
    _ -> false
  end

  def set_cloud_projects_enabled(enabled) when is_boolean(enabled) do
    SystemSettings.set_flag(
      @cloud_projects,
      enabled,
      "Signed-in users may save, open and delete projects in the cloud"
    )
  end

  @doc """
  Whether saving or exporting a model needs a signed-in account. Off when
  unset. The browser applies it only while sign-in is open.
  """
  def save_requires_account? do
    SystemSettings.get_flag(@save_requires_account, false) == true
  rescue
    _ -> false
  end

  def set_save_requires_account(enabled) when is_boolean(enabled) do
    SystemSettings.set_flag(
      @save_requires_account,
      enabled,
      "Saving or exporting a model asks the user to sign in first"
    )
  end
end
