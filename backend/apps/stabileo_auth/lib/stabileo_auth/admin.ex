defmodule StabileoAuth.Admin do
  @moduledoc """
  Admin site sign-in, and the account actions admins take. A valid account
  that is not an admin gets the same answer as a wrong password.
  """

  import Ecto.Query

  alias StabileoAuth.{Accounts, AdminAccess, Sessions}
  alias StabileoRepo.{Listing, Repo}
  alias StabileoRepo.Schemas.{Account, AccountMilestone, Project, SignupSource}

  @sortable [:inserted_at, :last_sign_in_at, :email, :name]

  @doc "Password sign-in, only where `config :stabileo_auth, :admin_password_login` is true."
  def login(email, password, metadata \\ %{}) do
    if AdminAccess.password_login?(),
      do: password_login(email, password, metadata),
      else: {:error, :not_found}
  end

  defp password_login(email, password, metadata) do
    with {:ok, account} <- Accounts.authenticate(email, password),
         true <- AdminAccess.admin?(account) do
      StabileoAuth.sign_in(account, metadata, "admin")
    else
      false -> {:error, :invalid_credentials}
      {:error, :account_disabled} -> {:error, :invalid_credentials}
      {:error, reason} -> {:error, reason}
    end
  end

  def refresh(refresh_token, metadata \\ %{}) do
    StabileoAuth.refresh(refresh_token, metadata, "admin", &AdminAccess.admin?/1)
  end

  @doc "Accounts page with live session counts per row. See `StabileoRepo.Listing` for the params."
  def list_accounts(params) do
    {accounts, meta} =
      Account
      |> filter_status(params["status"])
      |> filter_channel(params["channel"])
      |> search(params["search"])
      |> Listing.paginate(params, @sortable, :inserted_at, default_dir: :desc)

    counts = Sessions.count_live(Enum.map(accounts, & &1.id))
    {Enum.map(accounts, &{&1, Map.get(counts, &1.id, 0)}), meta}
  end

  def get_account(id) do
    case Accounts.get_account(id) do
      nil -> {:error, :not_found}
      account -> {:ok, with_sessions(account)}
    end
  end

  def disable(%Account{id: id}, %Account{id: id}), do: {:error, :cannot_disable_self}

  def disable(%Account{} = _admin, %Account{} = account) do
    Repo.transaction(fn ->
      updated = account |> Ecto.Changeset.change(is_active: false) |> Repo.update!()
      {:ok, _count} = Sessions.revoke_all(account.id)
      with_sessions(updated)
    end)
  end

  def enable(%Account{} = account) do
    with {:ok, updated} <- account |> Ecto.Changeset.change(is_active: true) |> Repo.update() do
      {:ok, with_sessions(updated)}
    end
  end

  def force_logout(%Account{} = account) do
    {:ok, revoked} = Sessions.revoke_all(account.id)
    {:ok, with_sessions(account), revoked}
  end

  defp with_sessions(account) do
    {account, Map.get(Sessions.count_live([account.id]), account.id, 0)}
  end

  defp filter_status(query, "active"), do: where(query, [a], a.is_active)
  defp filter_status(query, "disabled"), do: where(query, [a], not a.is_active)
  defp filter_status(query, _status), do: query

  defp filter_channel(query, channel)
       when channel in ~w(google meta search social referral email direct other) do
    where(
      query,
      [a],
      a.id in subquery(
        from(s in SignupSource, where: s.channel == ^channel, select: s.account_id)
      )
    )
  end

  defp filter_channel(query, "unknown"),
    do: where(query, [a], a.id not in subquery(from(s in SignupSource, select: s.account_id)))

  defp filter_channel(query, _channel), do: query

  defp search(query, term) when is_binary(term) and term != "" do
    pattern = "%" <> String.replace(String.trim(term), ~r/[\\%_]/, "\\\\\\0") <> "%"
    where(query, [a], ilike(a.email, ^pattern) or ilike(a.name, ^pattern))
  end

  defp search(query, _term), do: query

  @doc "Active cloud projects per account, for the accounts given; accounts with none are absent."
  def project_counts([]), do: %{}

  def project_counts(account_ids) do
    from(p in Project,
      where: p.account_id in ^account_ids and p.is_active,
      group_by: p.account_id,
      select: {p.account_id, count(p.id)}
    )
    |> Repo.all()
    |> Map.new()
  end

  @source_fields ~w(channel paid placement utm_source utm_medium utm_campaign utm_content utm_term referrer landing_path trigger first_seen_at inserted_at)a

  @doc "Where each account came from, for the accounts given; accounts without a recorded source are absent."
  def signup_sources([]), do: %{}

  def signup_sources(account_ids) do
    from(s in SignupSource, where: s.account_id in ^account_ids)
    |> Repo.all()
    |> Map.new(&{&1.account_id, Map.take(&1, @source_fields)})
  end

  @doc "The milestones each account reached, as kind to moment."
  def milestones([]), do: %{}

  def milestones(account_ids) do
    from(m in AccountMilestone,
      where: m.account_id in ^account_ids,
      select: {m.account_id, m.kind, m.occurred_at}
    )
    |> Repo.all()
    |> Enum.group_by(&elem(&1, 0), &{elem(&1, 1), elem(&1, 2)})
    |> Map.new(fn {id, kinds} -> {id, Map.new(kinds)} end)
  end
end
