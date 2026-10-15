defmodule StabileoRepo.Migration do
  @moduledoc """
  Use instead of `Ecto.Migration` to get UUID primary and foreign keys and UTC
  timestamps.
  """

  defmacro __using__(_opts) do
    quote do
      use Ecto.Migration

      @primary_key {:id, :binary_id, autogenerate: true}
      @foreign_key_type :binary_id
      @timestamps_opts [type: :utc_datetime]
    end
  end
end
