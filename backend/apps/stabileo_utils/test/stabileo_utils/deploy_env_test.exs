defmodule StabileoUtils.DeployEnvTest do
  use ExUnit.Case, async: true

  @root Path.expand("../../../../..", __DIR__)

  defp read(path), do: File.read!(Path.join(@root, path))

  test "every variable runtime.exs reads reaches the server's .env through the deploy" do
    names =
      ~r/fetch_env(?:_integer|!)?\("([A-Z_]+)"/
      |> Regex.scan(read("backend/config/runtime.exs"), capture: :all_but_first)
      |> List.flatten()
      |> Enum.uniq()

    vars = read("infra/ansible/vars.yml")
    deploy = read(".github/workflows/deploy.yml")

    assert "APP_URL" in names

    for name <- names do
      assert vars =~ ~r/^  - #{name}$/m, "#{name} is not in infra/ansible/vars.yml"

      assert deploy =~ ~r/^\s+#{name}: \$\{\{ (vars|secrets)\.#{name} \}\}$/m,
             "#{name} is not passed to Ansible in deploy.yml"
    end
  end
end
