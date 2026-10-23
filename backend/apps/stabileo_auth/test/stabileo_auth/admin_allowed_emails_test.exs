defmodule StabileoAuth.AdminAllowedEmailsTest do
  use StabileoRepo.DataCase, async: false

  alias StabileoAuth.AdminAllowedEmails
  alias StabileoRepo.Factory
  alias StabileoRepo.Schemas.AdminAllowedEmail

  test "allow adds an email with who added it" do
    admin = Factory.insert(:admin)

    assert {:ok, allowed} = AdminAllowedEmails.allow("New@Example.com", admin)
    assert allowed.email == "new@example.com"
    assert allowed.added_by.id == admin.id
    assert AdminAllowedEmails.active?("NEW@example.com")
  end

  test "allow refuses an email already allowed, and one outside the domains" do
    Factory.insert(:allowed_email, email: "taken@example.com")

    assert {:error, cs} = AdminAllowedEmails.allow("taken@example.com")
    assert %{email: ["is already allowed"]} = errors_on(cs)

    assert {:error, cs} = AdminAllowedEmails.allow("someone@gmail.com")
    assert %{email: ["must be at an allowed domain"]} = errors_on(cs)
  end

  test "allow reactivates a removed email in place" do
    removed = Factory.insert(:allowed_email, email: "back@example.com", is_active: false)

    assert {:ok, allowed} = AdminAllowedEmails.allow("back@example.com")
    assert allowed.id == removed.id
    assert Repo.get!(AdminAllowedEmail, removed.id).is_active
  end

  test "remove deactivates, and an admin cannot remove their own email" do
    admin = Factory.insert(:admin)
    other = Factory.insert(:allowed_email, email: "other@example.com")
    own = Repo.get_by!(AdminAllowedEmail, email: admin.email)

    assert {:ok, %{is_active: false}} = AdminAllowedEmails.remove(admin, other)
    refute AdminAllowedEmails.active?("other@example.com")

    assert {:error, :cannot_remove_self} = AdminAllowedEmails.remove(admin, own)
    assert AdminAllowedEmails.active?(admin.email)
  end

  test "list filters by status and searches the email" do
    Factory.insert(:allowed_email, email: "on-list@example.com")
    Factory.insert(:allowed_email, email: "off-list@example.com", is_active: false)

    emails = fn params ->
      {rows, _meta} = AdminAllowedEmails.list(Map.put(params, "search", "list@"))
      rows |> Enum.map(& &1.email) |> Enum.sort()
    end

    assert emails.(%{}) == ["on-list@example.com"]
    assert emails.(%{"status" => "disabled"}) == ["off-list@example.com"]
    assert emails.(%{"status" => "all"}) == ["off-list@example.com", "on-list@example.com"]
  end
end
