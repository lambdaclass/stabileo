defmodule StabileoMarketing.HttpClient do
  @moduledoc "Swapped in tests through `config :stabileo_marketing, StabileoMarketing.HttpClient`."

  @type header :: {String.t(), String.t()}

  @callback get_json(url :: String.t(), headers :: [header()]) :: {:ok, term()} | {:error, term()}
  @callback post_json(url :: String.t(), headers :: [header()], body :: term()) ::
              {:ok, term()} | {:error, term()}
  @callback post_form(url :: String.t(), form :: [{String.t(), String.t()}]) ::
              {:ok, term()} | {:error, term()}

  def get_json(url, headers \\ []), do: impl().get_json(url, headers)
  def post_json(url, headers, body), do: impl().post_json(url, headers, body)
  def post_form(url, form), do: impl().post_form(url, form)

  defp impl,
    do: Application.get_env(:stabileo_marketing, __MODULE__, StabileoMarketing.HttpClient.Httpc)
end
