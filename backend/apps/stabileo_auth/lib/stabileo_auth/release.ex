defmodule StabileoAuth.Release do
  @moduledoc """
  Release tasks for auth, run with `bin/stabileo eval`. Production gets its
  first admin with
  `bin/stabileo eval 'StabileoAuth.Release.allow_admin_email("you@lambdaclass.com")'`.
  """

  def allow_admin_email(email) do
    {:ok, _} = Application.ensure_all_started(:stabileo_auth)

    case StabileoAuth.AdminAllowedEmails.allow(email) do
      {:ok, allowed} ->
        IO.puts("#{allowed.email} is allowed into the admin site")

      {:error, changeset} ->
        raise "could not allow #{email}: #{inspect(changeset.errors)}"
    end
  end
end
