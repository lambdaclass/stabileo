defmodule StabileoMarketing.SignUps do
  @moduledoc "Runs inside the sign-up's transaction behind a savepoint: nothing here may fail it."

  require Logger

  alias StabileoMarketing.{Conversions, SignupSources}
  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.Account

  def after_sign_up(%Account{} = account, attrs, metadata) do
    Repo.query!("SAVEPOINT after_sign_up")

    try do
      record(account, attrs, metadata)
      Repo.query!("RELEASE SAVEPOINT after_sign_up")
    rescue
      error ->
        Repo.query!("ROLLBACK TO SAVEPOINT after_sign_up")
        Logger.warning("sign-up marketing skipped: #{Exception.message(error)}")
    end

    :ok
  end

  defp record(account, attrs, metadata) do
    source = Map.get(attrs, "source")
    _ = SignupSources.record(account, source)

    Conversions.enqueue_sign_up(
      account,
      Map.get(attrs, "attribution"),
      if(is_map(source), do: source["page"]),
      metadata
    )
  end
end
