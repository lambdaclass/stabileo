defmodule StabileoAuth.AccountJSON do
  @moduledoc "The one JSON shape of an account, shared by every auth response."

  alias StabileoAuth.Consents
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

  @doc "The account plus its current consents: what the product app gets for the signed-in user."
  def render_with_consents(%Account{} = account) do
    account
    |> render()
    |> Map.put(:consents, consents_json(Consents.current(account)))
  end

  def consents_json(consents) do
    %{
      terms: consents.terms,
      terms_current: Consents.terms_current?(consents),
      usage_analytics: consents.usage_analytics,
      model_research: consents.model_research
    }
  end
end
