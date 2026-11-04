defmodule StabileoRepo.Schema do
  @moduledoc """
  Use instead of `Ecto.Schema` to get UUID primary and foreign keys and UTC
  timestamps.
  """

  defmacro __using__(_opts) do
    quote do
      use Ecto.Schema

      @primary_key {:id, :binary_id, autogenerate: true}
      @foreign_key_type :binary_id
      @timestamps_opts [type: :utc_datetime]
    end
  end
end
