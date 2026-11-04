defmodule StabileoUtilsTest do
  use ExUnit.Case, async: true

  describe "version/0" do
    test "is the trimmed repo-root VERSION file, or \"unknown\" without one" do
      expected =
        case File.read(Path.expand("../../../../VERSION", __DIR__)) do
          {:ok, content} -> String.trim(content)
          {:error, _} -> "unknown"
        end

      assert StabileoUtils.version() == expected
    end
  end

  describe "presence/1" do
    test "returns a non-blank string verbatim" do
      assert StabileoUtils.presence("https://app.example.com") == "https://app.example.com"
    end

    test "nil is treated as absent" do
      assert StabileoUtils.presence(nil) == nil
    end

    test "an empty string is treated as absent — the deploy can't omit unset vars, they arrive as \"\"" do
      assert StabileoUtils.presence("") == nil
    end

    test "a whitespace-only string is treated as absent" do
      assert StabileoUtils.presence("   ") == nil
    end

    test "detects blankness but does not sanitize — surrounding whitespace is preserved" do
      assert StabileoUtils.presence(" https://app.example.com ") ==
               " https://app.example.com "
    end

    test "composes with || so a blank collapses to the caller's fallback" do
      fallback = "https://fallback.example.com"

      assert (StabileoUtils.presence(nil) || fallback) == fallback
      assert (StabileoUtils.presence("") || fallback) == fallback

      assert (StabileoUtils.presence("https://app.example.com") || fallback) ==
               "https://app.example.com"
    end
  end

  describe "fetch_env!/2" do
    test "returns the value when the variable is set" do
      System.put_env("SCASAAS_FETCH_ENV_REQUIRED_OK", "ecto://localhost/db")
      on_exit(fn -> System.delete_env("SCASAAS_FETCH_ENV_REQUIRED_OK") end)

      assert StabileoUtils.fetch_env!("SCASAAS_FETCH_ENV_REQUIRED_OK") == "ecto://localhost/db"
    end

    test "raises when the variable is unset" do
      System.delete_env("SCASAAS_FETCH_ENV_REQUIRED_UNSET")

      assert_raise RuntimeError, ~r/SCASAAS_FETCH_ENV_REQUIRED_UNSET.*missing or blank/, fn ->
        StabileoUtils.fetch_env!("SCASAAS_FETCH_ENV_REQUIRED_UNSET")
      end
    end

    test ~s(raises when the variable is blank — the deploy writes unset vars as "") do
      System.put_env("SCASAAS_FETCH_ENV_REQUIRED_BLANK", "   ")
      on_exit(fn -> System.delete_env("SCASAAS_FETCH_ENV_REQUIRED_BLANK") end)

      assert_raise RuntimeError, ~r/SCASAAS_FETCH_ENV_REQUIRED_BLANK.*missing or blank/, fn ->
        StabileoUtils.fetch_env!("SCASAAS_FETCH_ENV_REQUIRED_BLANK")
      end
    end

    test "appends the hint to the error message" do
      System.delete_env("SCASAAS_FETCH_ENV_REQUIRED_HINT")

      assert_raise RuntimeError, ~r/run: mix phx.gen.secret/, fn ->
        StabileoUtils.fetch_env!("SCASAAS_FETCH_ENV_REQUIRED_HINT", "run: mix phx.gen.secret")
      end
    end
  end

  describe "fetch_env/2" do
    test "returns the value when the variable is set" do
      System.put_env("SCASAAS_FETCH_ENV_OPTIONAL_SET", "real")
      on_exit(fn -> System.delete_env("SCASAAS_FETCH_ENV_OPTIONAL_SET") end)

      assert StabileoUtils.fetch_env("SCASAAS_FETCH_ENV_OPTIONAL_SET", "fallback") == "real"
    end

    test "returns the default when the variable is unset" do
      System.delete_env("SCASAAS_FETCH_ENV_OPTIONAL_UNSET")

      assert StabileoUtils.fetch_env("SCASAAS_FETCH_ENV_OPTIONAL_UNSET", "fallback") == "fallback"
    end

    test "returns the default when the variable is blank" do
      System.put_env("SCASAAS_FETCH_ENV_OPTIONAL_BLANK", "")
      on_exit(fn -> System.delete_env("SCASAAS_FETCH_ENV_OPTIONAL_BLANK") end)

      assert StabileoUtils.fetch_env("SCASAAS_FETCH_ENV_OPTIONAL_BLANK", "fallback") == "fallback"
    end

    test "returns nil when unset with no default given" do
      System.delete_env("SCASAAS_FETCH_ENV_OPTIONAL_NIL")

      assert StabileoUtils.fetch_env("SCASAAS_FETCH_ENV_OPTIONAL_NIL") == nil
    end
  end

  describe "fetch_env_integer/2" do
    test "parses the value when the variable is set" do
      System.put_env("SCASAAS_FETCH_ENV_INTEGER_SET", " 500 ")
      on_exit(fn -> System.delete_env("SCASAAS_FETCH_ENV_INTEGER_SET") end)

      assert StabileoUtils.fetch_env_integer("SCASAAS_FETCH_ENV_INTEGER_SET", 50) == 500
    end

    test "a missing or blank variable collapses to the default" do
      System.delete_env("SCASAAS_FETCH_ENV_INTEGER_MISSING")
      System.put_env("SCASAAS_FETCH_ENV_INTEGER_BLANK", "")
      on_exit(fn -> System.delete_env("SCASAAS_FETCH_ENV_INTEGER_BLANK") end)

      assert StabileoUtils.fetch_env_integer("SCASAAS_FETCH_ENV_INTEGER_MISSING", 50) == 50
      assert StabileoUtils.fetch_env_integer("SCASAAS_FETCH_ENV_INTEGER_BLANK", 50) == 50
    end

    test "a value that is not an integer raises naming the variable" do
      System.put_env("SCASAAS_FETCH_ENV_INTEGER_BAD", "500ms")
      on_exit(fn -> System.delete_env("SCASAAS_FETCH_ENV_INTEGER_BAD") end)

      assert_raise ArgumentError, ~r/SCASAAS_FETCH_ENV_INTEGER_BAD must be an integer/, fn ->
        StabileoUtils.fetch_env_integer("SCASAAS_FETCH_ENV_INTEGER_BAD", 50)
      end
    end
  end
end
