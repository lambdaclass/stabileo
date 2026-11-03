defmodule StabileoMarketing.Ads.Source do
  @moduledoc """
  Where an ad account's numbers come from. Every source answers `fetch/3` with
  the same snapshot: amounts in the account's currency, counts as decimals,
  `level` one of `"campaign"`, `"ad_group"` or `"ad"`. Names the platform
  gives (objectives, result types, conversions) stay as its codes; the admin
  site words them.
  """

  alias StabileoRepo.Schemas.AdAccount

  @type snapshot :: %{
          account: %{name: String.t() | nil, currency: String.t() | nil},
          entities: [map()],
          metrics: [map()],
          conversions: [map()],
          budgets: [map()]
        }

  @type step :: %{key: String.t(), status: :ok | :error | :skipped, detail: String.t() | nil}

  @callback fetch(AdAccount.t(), Date.Range.t(), today :: Date.t()) ::
              {:ok, snapshot()} | {:error, term()}

  @doc "Checks the account's credentials and reads it, one step per thing that can fail."
  @callback check(AdAccount.t()) :: [step()]

  @doc "A failure reason as one line for the sync status and the connection report."
  def describe_error({:http_error, status, message}), do: "HTTP #{status}: #{message}"
  def describe_error({:request_failed, reason}), do: "Could not connect: #{inspect(reason)}"

  def describe_error(:invalid_service_account),
    do: "The service account key is not a JSON with client_email and private_key"

  def describe_error(:invalid_oauth_response), do: "Google returned no access token"
  def describe_error(:invalid_response), do: "The response is not JSON"
  def describe_error(reason), do: inspect(reason)

  def step(key, status, detail \\ nil), do: %{key: key, status: status, detail: detail}
end
