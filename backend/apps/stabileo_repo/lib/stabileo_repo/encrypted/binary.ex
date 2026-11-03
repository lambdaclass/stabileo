defmodule StabileoRepo.Encrypted.Binary do
  @moduledoc "A text column stored encrypted by `StabileoRepo.Vault`."

  use Cloak.Ecto.Binary, vault: StabileoRepo.Vault
end
