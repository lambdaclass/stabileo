defmodule StabileoRepo.Vault do
  @moduledoc """
  Encrypts the secrets kept in the database (`StabileoRepo.Encrypted.Binary`)
  with AES-256-GCM. The key is `:stabileo_repo, :vault_key` (32 bytes). In
  production it comes from `CLOAK_KEY`, or else is derived from
  `SECRET_KEY_BASE`, so changing that secret makes the stored ones unreadable.
  """

  use Cloak.Vault, otp_app: :stabileo_repo

  @impl GenServer
  def init(config) do
    key = Application.fetch_env!(:stabileo_repo, :vault_key)

    {:ok,
     Keyword.put(config, :ciphers,
       default: {Cloak.Ciphers.AES.GCM, tag: "AES.GCM.V1", key: key, iv_length: 12}
     )}
  end
end
