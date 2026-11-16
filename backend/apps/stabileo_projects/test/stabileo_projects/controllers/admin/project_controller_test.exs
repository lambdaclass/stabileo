defmodule StabileoProjects.Controllers.Admin.ProjectControllerTest do
  use StabileoProjects.ConnCase, async: false

  alias StabileoRepo.Features

  setup do
    {:ok, _} = Features.set_cloud_projects_enabled(true)
    admin = Factory.insert(:admin)
    %{token: admin_log_in(admin)}
  end

  test "GET / lists every owner's projects, metadata only", %{token: token} do
    owner = Factory.insert(:account, name: "Owner")
    {:ok, _} = StabileoAuth.Consents.record(owner, "model_research", true)
    gzip = ~s({"a":1}) |> :zlib.gzip() |> Base.encode64()

    {:ok, _} =
      StabileoProjects.Projects.create(owner, %{
        "name" => "Hangar",
        "app_mode" => "pro",
        "content" => gzip
      })

    body = admin_request(:get, "/", %{}, token) |> json_body(200)
    assert body["meta"]["total"] == 1
    assert [row] = body["data"]
    refute Map.has_key?(row, "content")
    assert row["name"] == "Hangar"
    assert row["owner"] == %{"id" => owner.id, "email" => owner.email, "name" => "Owner"}
    assert row["research_consent"] == true
  end

  test "401 without an admin token, and for a product token" do
    assert admin_request(:get, "/") |> json_body(401)
    user = Factory.insert(:account)
    assert admin_request(:get, "/", %{}, log_in(user)) |> json_body(401)
  end
end
