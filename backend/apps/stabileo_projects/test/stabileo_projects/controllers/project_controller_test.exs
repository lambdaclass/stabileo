defmodule StabileoProjects.Controllers.ProjectControllerTest do
  use StabileoProjects.ConnCase, async: false

  alias StabileoRepo.Features
  alias StabileoRepo.Schemas.Project

  @keys ~w(app_mode app_version content_bytes element_count id inserted_at name node_count updated_at)

  setup do
    {:ok, _} = Features.set_cloud_projects_enabled(true)
    account = Factory.insert(:account)
    %{account: account, token: log_in(account)}
  end

  defp content, do: ~s({"version":"2.0"}) |> :zlib.gzip() |> Base.encode64()

  defp create(token, overrides \\ %{}) do
    request(
      :post,
      "/",
      Map.merge(%{"name" => "Frame", "app_mode" => "basic", "content" => content()}, overrides),
      token
    )
  end

  test "POST / creates and answers the metadata", %{account: account, token: token} do
    body = create(token, %{"element_count" => 3, "app_version" => "0.3.0"}) |> json_body(201)
    assert Enum.sort(Map.keys(body["data"])) == @keys
    assert body["data"]["name"] == "Frame"
    assert body["data"]["element_count"] == 3
    assert Repo.get!(Project, body["data"]["id"]).account_id == account.id
  end

  test "GET /:id answers the content as it was sent", %{token: token} do
    id = (create(token) |> json_body(201))["data"]["id"]
    body = request(:get, "/#{id}", %{}, token) |> json_body(200)
    assert Enum.sort(Map.keys(body["data"])) == Enum.sort(["content" | @keys])
    assert body["data"]["content"] |> Base.decode64!() |> :zlib.gunzip() == ~s({"version":"2.0"})
  end

  test "GET / lists with meta and the limits", %{token: token} do
    create(token) |> json_body(201)
    body = request(:get, "/", %{}, token) |> json_body(200)
    assert [row] = body["data"]
    refute Map.has_key?(row, "content")
    assert body["meta"]["total"] == 1
    assert body["meta"]["max_projects"] == StabileoProjects.Projects.limits().max_projects
  end

  test "PUT and DELETE change only the caller's project", %{token: token} do
    id = (create(token) |> json_body(201))["data"]["id"]

    assert (request(:put, "/#{id}", %{"name" => "Renamed"}, token)
            |> json_body(200))["data"]["name"] == "Renamed"

    request(:delete, "/#{id}", %{}, token) |> json_body(200)

    assert request(:get, "/#{id}", %{}, token) |> json_body(404) |> Map.get("error") ==
             "not_found"

    refute Repo.get!(Project, id).is_active
  end

  test "422 with the failing field", %{token: token} do
    body = create(token, %{"content" => "not base64 gzip"}) |> json_body(422)
    assert body["error"] == "validation_error"
    assert body["details"]["content"] == ["must be a gzipped JSON object, base64-encoded"]

    body = create(token, %{"app_mode" => "edu"}) |> json_body(422)
    assert body["details"]["app_mode"] == ["is invalid"]
  end

  test "404 for another account's project", %{token: token} do
    other = Factory.insert(:account)
    id = (create(log_in(other)) |> json_body(201))["data"]["id"]

    assert request(:get, "/#{id}", %{}, token) |> json_body(404) |> Map.get("error") ==
             "not_found"

    assert request(:put, "/#{id}", %{"name" => "x"}, token) |> json_body(404) |> Map.get("error") ==
             "not_found"
  end

  test "403 cloud_projects_disabled while the flag is off", %{token: token} do
    {:ok, _} = Features.set_cloud_projects_enabled(false)

    assert request(:get, "/", %{}, token) |> json_body(403) |> Map.get("error") ==
             "cloud_projects_disabled"

    assert create(token) |> json_body(403) |> Map.get("error") == "cloud_projects_disabled"
  end

  test "409 project_limit_reached past the limit", %{account: account, token: token} do
    now = DateTime.utc_now() |> DateTime.truncate(:second)

    Repo.insert_all(
      Project,
      for i <- 1..StabileoProjects.Projects.limits().max_projects do
        %{
          id: Ecto.UUID.generate(),
          account_id: account.id,
          name: "p#{i}",
          app_mode: "basic",
          content: :zlib.gzip("{}"),
          content_bytes: 2,
          is_active: true,
          inserted_at: now,
          updated_at: now
        }
      end
    )

    assert create(token) |> json_body(409) |> Map.get("error") == "project_limit_reached"
  end

  test "401 without a token, and for an admin-site token" do
    assert request(:get, "/") |> json_body(401) |> Map.get("error") == "missing_token"
    admin = Factory.insert(:admin)
    assert request(:get, "/", %{}, admin_log_in(admin)) |> json_body(401)
  end
end
