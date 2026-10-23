defmodule StabileoRepo.FeaturesTest do
  use StabileoRepo.DataCase, async: true

  alias StabileoRepo.{Features, SystemSettings}
  alias StabileoRepo.Schemas.SystemSetting

  test "user sign-in starts off when the setting was never written" do
    refute Repo.get_by(SystemSetting, key: "user_login_enabled")
    refute Features.user_login_enabled?()
  end

  test "set_user_login_enabled persists both ways, upserting one row" do
    {:ok, _} = Features.set_user_login_enabled(true)
    assert Features.user_login_enabled?()

    {:ok, _} = Features.set_user_login_enabled(false)
    refute Features.user_login_enabled?()

    assert Repo.aggregate(from(s in SystemSetting, where: s.key == "user_login_enabled"), :count) ==
             1

    assert %{"enabled" => false} = Repo.get_by!(SystemSetting, key: "user_login_enabled").value
  end

  test "a malformed value reads as off" do
    {:ok, _} = SystemSettings.set("user_login_enabled", %{"enabled" => "yes"})
    refute Features.user_login_enabled?()
  end

  describe "SystemSettings" do
    test "merge keeps keys it does not mention" do
      {:ok, _} = SystemSettings.set("merge_case", %{"a" => 1, "b" => 2})
      {:ok, _} = SystemSettings.merge("merge_case", %{"b" => 3})
      assert SystemSettings.get("merge_case") == %{"a" => 1, "b" => 3}
    end

    test "delete removes the key and a missing key is not an error" do
      {:ok, _} = SystemSettings.set("delete_case", %{"x" => true})
      assert :ok = SystemSettings.delete("delete_case")
      assert SystemSettings.get("delete_case") == nil
      assert :ok = SystemSettings.delete("delete_case")
    end
  end
end
