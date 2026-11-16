defmodule StabileoAuth.AdminAccounts do
  @moduledoc "How another app adds filters and fields to the admin's account list without auth knowing its tables."

  @callback filter(Ecto.Queryable.t(), map()) :: Ecto.Queryable.t()
  @callback extend([Ecto.UUID.t()]) :: %{Ecto.UUID.t() => map()}

  @behaviour __MODULE__

  @impl true
  def filter(query, _params), do: query

  @impl true
  def extend(_account_ids), do: %{}
end
