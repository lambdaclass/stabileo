defmodule StabileoMarketing.Conversions do
  @moduledoc """
  Each `event_id` is the one the pixel sends (the SHA-256 of the account's id, `first_save-<that hash>`), so
  Meta counts the event once. Nothing is queued without `"consent" => true` in `attribution`:
  the browser sends it only after the person accepted advertising cookies.
  """

  alias StabileoMarketing.Configs
  alias StabileoMarketing.Workers.MetaConversionSender
  alias StabileoRepo.Schemas.Account

  # Loose on purpose: it only keeps out what jsonb rejects (a NUL byte fails the
  # sign-up's transaction); Meta keeps adding suffixes to `_fbc`.
  @pixel_cookie ~r/\Afb\.[\w.-]{1,500}\z/

  def advertising_consent?(%{"consent" => true}), do: true
  def advertising_consent?(_attribution), do: false

  def attribution(%{} = cookies),
    do: compact(%{fbp: cookie(cookies["fbp"]), fbc: cookie(cookies["fbc"])})

  def attribution(_cookies), do: %{}

  def enqueue_sign_up(%Account{} = account, attribution, page, metadata) do
    enqueue(attribution, fn ->
      event("CompleteRegistration", hash(account.id), page, user_data(account, attribution, metadata))
    end)
  end

  def enqueue_first_save(%Account{} = account, attribution, page, metadata) do
    enqueue(attribution, fn ->
      event("FirstSave", "first_save-#{hash(account.id)}", page, user_data(account, attribution, metadata))
    end)
  end

  def credentials do
    case {Configs.meta_pixel_id(), Configs.meta_capi_access_token()} do
      {pixel_id, token} when is_binary(pixel_id) and is_binary(token) ->
        if pixel_id =~ ~r/\A\d+\z/, do: {:ok, pixel_id, token}, else: {:error, :not_configured}

      _ ->
        {:error, :not_configured}
    end
  end

  defp enqueue(attribution, build_event) do
    case {advertising_consent?(attribution), credentials()} do
      {false, _} -> {:ok, :no_consent}
      {true, {:ok, _pixel_id, _token}} -> %{events: [build_event.()]} |> MetaConversionSender.new() |> Oban.insert()
      {true, {:error, :not_configured}} -> {:ok, :not_configured}
    end
  end

  defp event(name, event_id, page, user_data) do
    compact(%{
      event_name: name,
      event_time: System.system_time(:second),
      event_id: event_id,
      action_source: "website",
      event_source_url: page_url(page),
      user_data: compact(user_data)
    })
  end

  defp user_data(account, attribution, metadata) do
    attribution
    |> attribution()
    |> Map.merge(%{
      em: account.email |> String.trim() |> String.downcase() |> hash(),
      external_id: hash(account.id),
      client_ip_address: text(metadata[:ip_address]),
      client_user_agent: text(metadata[:user_agent])
    })
  end

  defp page_url(page) when is_binary(page) do
    base = Application.get_env(:stabileo_auth, :app_frontend_url) || ""

    if text(page) == page and String.starts_with?(page, "/") and String.length(page) <= 512,
      do: base <> page,
      else: base <> "/"
  end

  defp page_url(_page), do: (Application.get_env(:stabileo_auth, :app_frontend_url) || "") <> "/"

  defp cookie(value) when is_binary(value), do: if(value =~ @pixel_cookie, do: value)
  defp cookie(_value), do: nil

  defp text(value) when is_binary(value) do
    if String.valid?(value) and not String.contains?(value, <<0>>), do: value
  end

  defp text(_value), do: nil

  defp hash(value) when value in [nil, ""], do: nil
  defp hash(value), do: Base.encode16(:crypto.hash(:sha256, value), case: :lower)

  defp compact(map), do: Map.reject(map, fn {_key, value} -> value in [nil, ""] end)
end
