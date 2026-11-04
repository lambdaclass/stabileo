defmodule StabileoRepo.ListingTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.{Factory, Listing}
  alias StabileoRepo.Schemas.Account

  setup do
    for name <- ~w(Carla Ana Bruno) do
      Factory.insert(:account, name: name, email: "listing-#{String.downcase(name)}@example.com")
    end

    :ok
  end

  defp names(params, opts \\ []) do
    query = from(a in Account, where: like(a.email, "listing-%"))
    {rows, meta} = Listing.paginate(query, params, [:name, :email], :name, opts)
    {Enum.map(rows, & &1.name), meta}
  end

  test "sorts by the requested field and direction" do
    assert {["Ana", "Bruno", "Carla"], %{total: 3, limit: 50, offset: 0}} = names(%{})
    assert {["Carla", "Bruno", "Ana"], _} = names(%{"sort_dir" => "desc"})
    assert {["Carla", "Bruno", "Ana"], _} = names(%{}, default_dir: :desc)
    assert {["Ana", "Bruno", "Carla"], _} = names(%{"sort_dir" => "asc"}, default_dir: :desc)
  end

  test "an unknown sort field falls back to the default" do
    assert {["Ana", "Bruno", "Carla"], _} = names(%{"sort_by" => "password_hash"})
  end

  test "pages with limit and offset, counting every match" do
    assert {["Bruno"], %{total: 3, limit: 1, offset: 1}} =
             names(%{"limit" => "1", "offset" => "1"})
  end

  test "clamps limit to 1..100 and offset to >= 0, ignoring garbage" do
    assert {_, %{limit: 100}} = names(%{"limit" => "1000"})
    assert {_, %{limit: 1}} = names(%{"limit" => "0"})
    assert {_, %{limit: 50, offset: 0}} = names(%{"limit" => "abc", "offset" => "-5"})
  end
end
