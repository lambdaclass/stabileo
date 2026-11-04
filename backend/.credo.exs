%{
  configs: [
    %{
      name: "default",
      files: %{
        included: [
          "apps/*/lib/",
          "apps/*/test/",
          "config/runtime.exs"
        ],
        excluded: [~r"/_build/", ~r"/deps/", ~r"/node_modules/"]
      },
      requires: ["./.credo/checks/no_raw_env.ex"],
      checks: %{
        extra: [
          {StabileoCredo.Checks.NoRawEnv, []}
        ]
      }
    }
  ]
}
