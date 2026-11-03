defmodule StabileoMarketing.Ads.FxRates do
  @moduledoc "The official selling dollar of each day, from argentinadatos.com's history."

  alias StabileoMarketing.HttpClient

  @url "https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial"

  def fetch(range) do
    case HttpClient.get_json(@url, [{"User-Agent", "stabileo-ads"}]) do
      {:ok, rows} when is_list(rows) ->
        {:ok,
         for %{"fecha" => day, "venta" => rate} <- rows,
             {:ok, date} <- [Date.from_iso8601(day)],
             date in range,
             is_number(rate) do
           %{date: date, usd_ars: Decimal.from_float(rate / 1)}
         end}

      {:ok, _other} ->
        {:error, :invalid_response}

      error ->
        error
    end
  end
end
