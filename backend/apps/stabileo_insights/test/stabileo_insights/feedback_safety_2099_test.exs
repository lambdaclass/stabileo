defmodule StabileoInsights.FeedbackSafety2099Test do
  use StabileoInsights.ConnCase, async: false

  alias StabileoInsights.FeedbackInbox
  alias StabileoRepo.Schemas.Feedback

  setup do
    original = Application.get_env(:stabileo_auth, :app_frontend_url)
    Application.put_env(:stabileo_auth, :app_frontend_url, "https://stabileo.com")
    on_exit(fn -> Application.put_env(:stabileo_auth, :app_frontend_url, original) end)
    account = Factory.insert(:account)
    %{account: account, token: log_in(account)}
  end

  defp note, do: %{"kind" => "bug", "message" => "Beam shows wrong moment"}

  test "authentication replaces the old mandatory captcha without a sentinel bypass" do
    for token <- [nil, "", "turnstile-bypass", "invalid-token"] do
      conn = request(:post, "/feedback", note(), token)
      assert conn.status == 401
    end

    assert Repo.aggregate(Feedback, :count) == 0
  end

  test "valid authenticated feedback keeps the real sender and ignores a forged inline author", %{
    account: account,
    token: token
  } do
    body =
      request(
        :post,
        "/feedback",
        Map.merge(note(), %{
          "name" => "Eve\n**Tipo:** Admin" <> String.duplicate("x", 500),
          "account_id" => Ecto.UUID.generate(),
          "status" => "done"
        }),
        token
      )
      |> json_body(201)

    saved = Repo.get!(Feedback, body["data"]["id"])
    assert saved.account_id == account.id
    assert saved.status == "new"
    assert saved.message == note()["message"]
  end

  test "all payload field bounds accept their limit and reject the next character", %{
    token: token
  } do
    for {field, limit, prefix} <- [
          {"message", 4000, ""},
          {"contact_email", 255, "a@"},
          {"page", 255, ""},
          {"app_version", 32, ""}
        ] do
      value = prefix <> String.duplicate("x", limit - String.length(prefix))
      request(:post, "/feedback", Map.put(note(), field, value), token) |> json_body(201)

      body =
        request(:post, "/feedback", Map.put(note(), field, value <> "x"), token) |> json_body(422)

      assert [_] = body["details"][field]
    end
  end

  test "rejects missing, empty, non-text and overlong descriptions and unknown types", %{
    token: token
  } do
    for attrs <- [
          Map.delete(note(), "message"),
          Map.put(note(), "message", ""),
          Map.put(note(), "message", 42),
          Map.put(note(), "message", String.duplicate("x", 5001)),
          Map.put(note(), "kind", "__proto__")
        ] do
      request(:post, "/feedback", attrs, token) |> json_body(422)
    end

    assert Repo.aggregate(Feedback, :count) == 0
  end

  test "keeps only HTTPS links on the configured app origin", %{token: token} do
    link = "https://stabileo.com/#s=abc"

    body =
      request(:post, "/feedback", Map.put(note(), "model_link", link), token) |> json_body(201)

    assert Repo.get!(Feedback, body["data"]["id"]).model_link == link

    for link <- [
          "https://evil.example/phish",
          "javascript:alert(1)",
          "http://stabileo.com/",
          "https://stabileo.com.evil.example/",
          "https://stabileo.com@evil.example/"
        ] do
      body =
        request(:post, "/feedback", Map.put(note(), "model_link", link), token) |> json_body(422)

      assert [_] = body["details"]["model_link"]
    end
  end

  test "model links retain main's 8192 character bound", %{token: token} do
    prefix = "https://stabileo.com/#s="
    link = prefix <> String.duplicate("x", 8192 - String.length(prefix))
    request(:post, "/feedback", Map.put(note(), "model_link", link), token) |> json_body(201)

    body =
      request(:post, "/feedback", Map.put(note(), "model_link", link <> "x"), token)
      |> json_body(422)

    assert [_] = body["details"]["model_link"]
  end

  test "browser metadata retains main's 512 character bound", %{token: token} do
    for size <- [512, 513] do
      conn =
        :post
        |> Plug.Test.conn("/feedback", note())
        |> put_req_header("accept", "application/json")
        |> put_req_header("authorization", "Bearer " <> token)
        |> put_req_header("user-agent", String.duplicate("x", size))
        |> StabileoInsights.Router.call(StabileoInsights.Router.init([]))

      if size == 512 do
        json_body(conn, 201)
      else
        body = json_body(conn, 422)
        assert [_] = body["details"]["user_agent"]
      end
    end
  end

  test "the shared creation path refuses non-object bodies without raising", %{account: account} do
    for params <- [nil, [note()], 42, "text"] do
      assert {:error, changeset} = FeedbackInbox.create(params, account, %{})
      refute changeset.valid?
    end

    assert Repo.aggregate(Feedback, :count) == 0
  end
end
