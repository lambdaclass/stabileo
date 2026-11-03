defmodule StabileoMarketing.SignUps do
  @moduledoc """
  What happens when an account is created, run by `StabileoAuth.UserOAuth`
  inside the sign-up's transaction (`config :stabileo_auth, :after_sign_up`):
  where the visit came from is saved and `CompleteRegistration` is queued for
  Meta. Neither may cost the sign-up: a source that does not validate is left
  out.
  """

  alias StabileoMarketing.{Conversions, SignupSources}
  alias StabileoRepo.Schemas.Account

  def after_sign_up(%Account{} = account, attrs, metadata) do
    source = Map.get(attrs, "source")
    _ = SignupSources.record(account, source)

    Conversions.enqueue_sign_up(
      account,
      Map.get(attrs, "attribution"),
      if(is_map(source), do: source["page"]),
      metadata
    )

    :ok
  end
end
