defmodule StabileoRepo.Schemas.AdminAllowedEmailTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.Schemas.{AdminAllowedEmail, SystemSetting}

  @domains ["example.com"]

  defp changeset(attrs), do: AdminAllowedEmail.changeset(%AdminAllowedEmail{}, attrs, @domains)

  test "inserts a trimmed, lowercased email at an allowed domain" do
    {:ok, allowed} = %{email: "  Staff@Example.com "} |> changeset() |> Repo.insert()

    saved = Repo.get!(AdminAllowedEmail, allowed.id)
    assert saved.email == "staff@example.com"
    assert saved.is_active == true
    assert saved.added_by_id == nil
  end

  test "requires email" do
    assert %{email: ["can't be blank"]} = errors_on(changeset(%{}))
  end

  test "rejects an email outside the allowed domains" do
    assert %{email: ["must be at an allowed domain"]} =
             errors_on(changeset(%{email: "a@gmail.com"}))
  end

  test "rejects a subdomain or a look-alike of an allowed domain" do
    for email <- ["a@evil.example.com", "a@example.com.evil.org", "a@notexample.com"] do
      assert %{email: ["must be at an allowed domain"]} = errors_on(changeset(%{email: email}))
    end
  end

  test "rejects a malformed email" do
    assert %{email: ["must have @ sign and no spaces"]} = errors_on(changeset(%{email: "nope"}))
  end

  test "ignores is_active and added_by_id from attrs" do
    cs = changeset(%{email: "a@example.com", is_active: false, added_by_id: Ecto.UUID.generate()})
    assert Ecto.Changeset.get_change(cs, :is_active) == nil
    assert Ecto.Changeset.get_change(cs, :added_by_id) == nil
  end

  test "rejects a duplicate email regardless of case, leaving one row" do
    {:ok, _} = %{email: "dup@example.com"} |> changeset() |> Repo.insert()
    {:error, cs} = %{email: "DUP@example.com"} |> changeset() |> Repo.insert()

    assert %{email: ["is already allowed"]} = errors_on(cs)

    assert Repo.aggregate(
             from(a in AdminAllowedEmail, where: a.email == "dup@example.com"),
             :count
           ) == 1
  end

  describe "SystemSetting" do
    test "requires key and rejects a duplicate key" do
      assert %{key: ["can't be blank"]} =
               errors_on(SystemSetting.changeset(%SystemSetting{}, %{value: %{}}))

      {:ok, _} =
        %SystemSetting{} |> SystemSetting.changeset(%{key: "k", value: %{}}) |> Repo.insert()

      {:error, cs} =
        %SystemSetting{} |> SystemSetting.changeset(%{key: "k", value: %{}}) |> Repo.insert()

      assert %{key: ["has already been taken"]} = errors_on(cs)
    end
  end
end
