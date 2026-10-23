defmodule StabileoUtils do
  @moduledoc """
  Shared utilities for the umbrella: modules used across domain apps that
  cannot live in `stabileo_web` without creating a dependency cycle.
  """

  @external_resource version_file = Path.join([__DIR__, "..", "..", "..", "..", "VERSION"])
  @version (case File.read(version_file) do
              {:ok, content} -> String.trim(content)
              {:error, _} -> "unknown"
            end)

  @doc """
  The application version, read at compile time from the repo-root `VERSION`
  file, or `"unknown"` when there is none. Baked in at compile time so it ships
  inside the release, where the `VERSION` file itself is absent.
  """
  @spec version() :: String.t()
  def version, do: @version

  @doc """
  Returns `value` unless it is `nil` or blank (empty or whitespace-only),
  in which case it returns `nil` — so callers can supply a fallback with `||`.

  Meant for environment variables that may arrive as an empty string rather
  than unset: a deploy that writes every var unconditionally produces `""` for
  one it has no value for, which must be treated the same as missing. The value
  is returned verbatim when present — `presence/1` detects blankness, it does
  not sanitize.
  """
  @spec presence(String.t() | nil) :: String.t() | nil
  def presence(nil), do: nil

  def presence(value) when is_binary(value) do
    if String.trim(value) == "", do: nil, else: value
  end

  @doc """
  Fetches the environment variable `name`, raising if it is missing or blank.

  The required-variable counterpart to `fetch_env/2`: use it for any value the
  app cannot boot without. The optional `hint` is appended to the error to
  point operators at how to obtain a value.

  Reading env vars exclusively through this helper (and `fetch_env/2`) is
  enforced by the `NoRawEnv` Credo check.
  """
  @spec fetch_env!(String.t(), String.t() | nil) :: String.t()
  def fetch_env!(name, hint \\ nil) do
    presence(System.get_env(name)) || raise missing_env_error(name, hint)
  end

  @doc """
  Fetches the environment variable `name`, falling back to `default` when it is
  missing or blank.
  """
  @spec fetch_env(String.t(), String.t() | nil) :: String.t() | nil
  def fetch_env(name, default \\ nil) do
    presence(System.get_env(name)) || default
  end

  @doc """
  Fetches an integer environment variable, falling back to `default` when it is
  missing or blank. A value that is not a plain integer (`"500ms"`) raises naming
  the variable, instead of the bare `ArgumentError` `String.to_integer/1` gives.
  """
  @spec fetch_env_integer(String.t(), integer()) :: integer()
  def fetch_env_integer(name, default) do
    case fetch_env(name) do
      nil ->
        default

      value ->
        case Integer.parse(String.trim(value)) do
          {integer, ""} ->
            integer

          _ ->
            raise ArgumentError,
                  "environment variable #{name} must be an integer, got #{inspect(value)}"
        end
    end
  end

  defp missing_env_error(name, nil) do
    "environment variable #{name} is required but is missing or blank"
  end

  defp missing_env_error(name, hint) do
    "environment variable #{name} is required but is missing or blank.\n#{hint}"
  end
end
