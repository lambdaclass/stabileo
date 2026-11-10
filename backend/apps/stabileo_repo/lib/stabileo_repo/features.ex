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
  @assignments "assignments_enabled"
  @cloud_projects_limit "cloud_projects_limit"
  @cloud_projects_limit_range 1..100

  @doc "Off when the row is unset or unreadable."
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

  def assignments_enabled? do
    SystemSettings.get_flag(@assignments, false) == true
  rescue
    _ -> false
  end

  def set_assignments_enabled(enabled) when is_boolean(enabled) do
    SystemSettings.set_flag(
      @assignments,
      enabled,
      "Signed-in users may share Educational exercises as homework or timed exams"
    )
  end

  @doc "1 when unset or unreadable."
  def cloud_projects_limit do
    case SystemSettings.get(@cloud_projects_limit) do
      %{"value" => n} when is_integer(n) and n in @cloud_projects_limit_range -> n
      _ -> 1
    end
  rescue
    _ -> 1
  end

  def cloud_projects_limit_range, do: @cloud_projects_limit_range

  def set_cloud_projects_limit(n) when is_integer(n) and n in @cloud_projects_limit_range do
    SystemSettings.set(
      @cloud_projects_limit,
      %{"value" => n},
      "How many cloud projects one account may keep"
    )
  end
end
