defmodule StabileoAuth.Controllers.ConsentControllerTest do
  use StabileoAuth.ConnCase, async: true

  alias StabileoRepo.Schemas.Consent

  setup do
    account = Factory.insert(:account, email: Factory.unique_email("consent"))
    %{account: account, token: log_in(account).access_token}
  end

  test "POST /consents grants usage analytics and answers the account", %{
    account: account,
    token: token
  } do
    body =
      request(:post, "/consents", %{"kind" => "usage_analytics", "granted" => true}, token)
      |> json_body(201)

    assert body["data"]["id"] == account.id
    assert body["data"]["consents"]["usage_analytics"] == true
    assert body["data"]["consents"]["model_research"] == false

    saved = Repo.get_by!(Consent, account_id: account.id)
    assert saved.kind == "usage_analytics"
    assert saved.granted == true
    assert saved.user_agent == "conn-case"
  end

  test "POST /consents accepts the terms in force", %{account: account, token: token} do
    body = request(:post, "/consents", %{"kind" => "terms"}, token) |> json_body(201)
    assert body["data"]["consents"]["terms_current"] == true

    assert Repo.get_by!(Consent, account_id: account.id).version ==
             StabileoAuth.Consents.terms_version()
  end

  test "422 when granted is not a boolean", %{token: token} do
    body =
      request(:post, "/consents", %{"kind" => "model_research", "granted" => "yes"}, token)
      |> json_body(422)

    assert body["error"] == "validation_error"
    assert body["details"] == %{"granted" => ["must be true or false"]}
    assert Repo.aggregate(Consent, :count) == 0
  end

  test "422 for an unknown kind and for a missing kind", %{token: token} do
    body =
      request(:post, "/consents", %{"kind" => "newsletter", "granted" => true}, token)
      |> json_body(422)

    assert body["details"] == %{"kind" => ["is invalid"]}

    body = request(:post, "/consents", %{"granted" => true}, token) |> json_body(422)
    assert body["details"] == %{"kind" => ["can't be blank"]}
  end

  test "401 without a token" do
    assert request(:post, "/consents", %{"kind" => "terms"}) |> json_body(401) |> Map.get("error") ==
             "missing_token"
  end

  test "an admin-site token is refused" do
    admin = Factory.insert(:admin, email: Factory.unique_email("consent-admin"))
    token = admin_log_in(admin).access_token
    assert request(:post, "/consents", %{"kind" => "terms"}, token) |> json_body(401)
  end
end
