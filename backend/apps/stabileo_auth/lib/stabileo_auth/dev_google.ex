defmodule StabileoAuth.DevGoogle do
  @moduledoc "Only `config/dev.exs` selects it, and only while `GOOGLE_APP_CLIENT_ID` is unset."

  def enabled?, do: Application.get_env(:stabileo_auth, :dev_google, false) == true

  def authorize_url(config) do
    state = :crypto.strong_rand_bytes(16) |> Base.url_encode64(padding: false)
    uri = URI.parse(config[:redirect_uri])

    page = %URI{
      uri
      | path: "/api/v1/auth/google/dev",
        query: URI.encode_query(%{state: state, redirect_uri: config[:redirect_uri]})
    }

    {:ok, %{url: URI.to_string(page), session_params: %{state: state}}}
  end

  def callback(config, %{"state" => state, "code" => code}) do
    with %{state: ^state} <- config[:session_params],
         {:ok, json} <- Base.url_decode64(code, padding: false),
         {:ok, %{"email" => email} = person} when is_binary(email) and email != "" <-
           Jason.decode(json) do
      email = email |> String.trim() |> String.downcase()
      domain = email |> String.split("@") |> List.last()

      {:ok,
       %{
         user: %{
           "sub" => "dev-" <> email,
           "email" => email,
           "email_verified" => true,
           "name" => blank_to(person["name"], email),
           "hd" => domain
         },
         token: %{}
       }}
    else
      _ -> {:error, :invalid_callback}
    end
  end

  def callback(_config, _params), do: {:error, :missing_params}

  def page(state, redirect_uri) do
    js = &Jason.encode!(&1, escape: :html_safe)

    """
    <!doctype html><html><head><meta charset="utf-8"><title>Google (local)</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body{font:15px system-ui;max-width:360px;margin:48px auto;padding:0 16px}
    input,button{display:block;width:100%;box-sizing:border-box;margin:6px 0 14px;padding:8px;font:inherit}</style>
    </head><body>
    <h2>Google (local)</h2>
    <p>Development stand-in: no Google account is involved.</p>
    <form id="f">
    <label>Email<input name="email" type="email" required autofocus></label>
    <label>Name<input name="name" type="text"></label>
    <button type="submit">Continue</button>
    </form>
    <script>
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var p = { email: this.email.value, name: this.name.value };
      var c = btoa(unescape(encodeURIComponent(JSON.stringify(p)))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
      location.href = #{js.(redirect_uri)} + '?state=' + encodeURIComponent(#{js.(state)}) + '&code=' + c;
    });
    </script></body></html>
    """
  end

  defp blank_to(value, fallback) when is_binary(value) do
    if String.trim(value) == "", do: fallback, else: String.trim(value)
  end

  defp blank_to(_value, fallback), do: fallback
end
