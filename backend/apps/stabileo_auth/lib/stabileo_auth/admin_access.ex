defmodule StabileoAuth.AdminAccess do
  @moduledoc """
  Who is an admin: an account whose email is at an allowed domain and on the
  active admin allowlist. Read on every call, so a removal takes effect on the
  next request.
  """

  alias StabileoAuth.AdminAllowedEmails
  alias StabileoRepo.Schemas.Account

  def admin?(%Account{email: email}) do
    AdminAllowedEmails.domain_allowed?(email) and AdminAllowedEmails.active?(email)
  end

  def admin?(_), do: false

  def password_login? do
    Application.get_env(:stabileo_auth, :admin_password_login, false) == true
  end
end
