defmodule StabileoMarketing.ActivityTest do
  use StabileoMarketing.ConnCase, async: false

  alias StabileoMarketing.Workers.MetaConversionSender
  alias StabileoRepo.Schemas.{AccountActiveDay, AccountMilestone}

  setup do
    account = Factory.insert(:account)
    {:ok, _} = StabileoAuth.Consents.record(account, "usage_analytics", true)
    %{account: account, token: log_in(account)}
  end

  defp consented, do: %{"consent" => true, "fbp" => "fb.1.1700000000.123"}

  test "POST /activity records today and the new milestones, once; FirstSave goes to Meta once", %{account: account, token: token} do
    configure(%{"meta_pixel_id" => "123456789", "meta_capi_access_token" => "EAAB-token-0123456789"})

    body =
      request(
        :post,
        "/activity",
        %{"milestones" => ["first_analysis", "first_save", "nonsense"], "page" => "/app", "attribution" => consented()},
        token
      )
      |> json_body(200)

    assert Enum.sort(body["data"]["recorded"]) == ["first_analysis", "first_save"]

    again = request(:post, "/activity", %{"milestones" => ["first_save", "first_export"]}, token) |> json_body(200)
    assert again["data"]["recorded"] == ["first_export"]

    kinds = from(m in AccountMilestone, where: m.account_id == ^account.id, select: m.kind) |> Repo.all() |> Enum.sort()
    assert kinds == ["first_analysis", "first_export", "first_save"]
    assert [%{day: day}] = Repo.all(from(d in AccountActiveDay, where: d.account_id == ^account.id))
    assert day == StabileoMarketing.Days.today()

    assert [job] = all_enqueued(worker: MetaConversionSender)
    assert hd(job.args["events"])["event_name"] == "FirstSave"
    assert hd(job.args["events"])["event_id"] == "first_save-#{account.id}"
  end

  test "FirstSave stays off Meta without advertising consent", %{account: account, token: token} do
    configure(%{"meta_pixel_id" => "123456789", "meta_capi_access_token" => "EAAB-token-0123456789"})

    body = request(:post, "/activity", %{"milestones" => ["first_save"], "attribution" => %{"fbp" => "fb.1.1.1"}}, token) |> json_body(200)

    assert body["data"]["recorded"] == ["first_save"]
    assert Repo.exists?(from(m in AccountMilestone, where: m.account_id == ^account.id))
    assert all_enqueued(worker: MetaConversionSender) == []
  end

  test "nothing is recorded for an account that does not share usage" do
    configure(%{"meta_pixel_id" => "123456789", "meta_capi_access_token" => "EAAB-token-0123456789"})
    account = Factory.insert(:account)
    {:ok, _} = StabileoAuth.Consents.record(account, "usage_analytics", false)

    body =
      request(:post, "/activity", %{"milestones" => ["first_save"], "attribution" => consented()}, log_in(account))
      |> json_body(200)

    assert body["data"]["recorded"] == []
    assert Repo.aggregate(from(d in AccountActiveDay, where: d.account_id == ^account.id), :count) == 0
    assert Repo.aggregate(from(m in AccountMilestone, where: m.account_id == ^account.id), :count) == 0
    assert all_enqueued(worker: MetaConversionSender) == []
  end

  test "an empty call records only the day", %{account: account, token: token} do
    assert request(:post, "/activity", %{}, token) |> json_body(200) == %{"data" => %{"recorded" => []}}
    assert Repo.aggregate(from(d in AccountActiveDay, where: d.account_id == ^account.id), :count) == 1
  end

  test "422 for a milestones value that is not a short list of names", %{token: token} do
    for bad <- ["first_save", [1], ["a", "b", "c", "d"]] do
      body = request(:post, "/activity", %{"milestones" => bad}, token) |> json_body(422)
      assert body["error"] == "validation_error"
      assert body["details"]["milestones"] == ["must be a list of at most 3 milestone names"]
    end
  end

  test "401 without a session" do
    assert request(:post, "/activity", %{"milestones" => ["first_save"]}) |> json_body(401) |> Map.has_key?("error")
  end
end
