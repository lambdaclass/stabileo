defmodule StabileoAuth.AccountJSON do
  @moduledoc "The one JSON shape of an account, shared by every auth response."

  alias StabileoRepo.Schemas.Account

  def render(%Account{} = account) do
    %{
      id: account.id,
      email: account.email,
      name: account.name,
      company: account.company,
      job_title: account.job_title,
      country: account.country,
      locale: account.locale,
      email_verified_at: account.email_verified_at,
      inserted_at: account.inserted_at
    }
  end
end
