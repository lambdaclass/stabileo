defmodule StabileoRepo.SystemSettings do
  @moduledoc """
  Database-backed runtime settings: one JSON map per key in `system_settings`,
  plus boolean flag helpers.
  """

  import Ecto.Query

  alias StabileoRepo.Repo
  alias StabileoRepo.Schemas.SystemSetting

  @doc "Get a setting value by key. Returns the value map or nil."
  def get(key) do
    case Repo.one(from(s in SystemSetting, where: s.key == ^key)) do
      nil -> nil
      setting -> setting.value
    end
  end

  @doc """
  Merges `attrs` into the stored value, leaving keys it does not mention alone.

  One statement: `set/3` replaces the whole value, so a caller that read the row,
  changed one key and wrote it back puts every other key back as it read them.
  """
  def merge(key, attrs, description \\ nil) when is_map(attrs) do
    %SystemSetting{}
    |> SystemSetting.changeset(%{key: key, value: attrs, description: description})
    |> Repo.insert(
      on_conflict:
        from(s in SystemSetting,
          update: [set: [value: fragment("? || ?", s.value, ^attrs), updated_at: ^now()]]
        ),
      conflict_target: :key
    )
  end

  defp now, do: DateTime.utc_now() |> DateTime.truncate(:second)

  @doc """
  Upsert a setting. Replaces the whole value; see `merge/3` when other keys must
  survive.
  """
  def set(key, value, description \\ nil) do
    attrs = %{key: key, value: value, description: description}

    %SystemSetting{}
    |> SystemSetting.changeset(attrs)
    |> Repo.insert(
      on_conflict: {:replace, [:value, :description, :updated_at]},
      conflict_target: :key
    )
  end

  @doc "Remove a setting. A missing key is not an error."
  def delete(key) do
    Repo.delete_all(from(s in SystemSetting, where: s.key == ^key))
    :ok
  end

  @doc "Get a boolean feature flag. Returns the default if not set."
  def get_flag(key, default \\ false) do
    case get(key) do
      %{"enabled" => enabled} -> enabled
      _ -> default
    end
  end

  @doc "Set a boolean feature flag."
  def set_flag(key, enabled, description \\ nil) do
    set(key, %{"enabled" => enabled}, description)
  end
end
