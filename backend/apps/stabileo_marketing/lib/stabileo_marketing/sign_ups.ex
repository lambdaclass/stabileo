defmodule StabileoMarketing.SignUps do
  @moduledoc "Runs inside the sign-up's transaction: nothing here may fail it."

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
