alias StabileoRepo.{DemoPassword, Repo}
alias StabileoRepo.Schemas.Account

demo_accounts = [
  %{email: "admin@stabileo.com", name: "Stabileo Admin", company: "Stabileo", job_title: "Staff", country: "AR", locale: "es"},
  %{email: "demo@stabileo.com", name: "Demo Engineer", company: "Stabileo", job_title: "Structural engineer", country: "AR", locale: "es"},
  %{email: "demo-en@stabileo.com", name: "Demo Engineer (EN)", company: "Stabileo", job_title: "Structural engineer", country: "US", locale: "en"}
]

for attrs <- demo_accounts do
  unless Repo.get_by(Account, email: attrs.email) do
    attrs
    |> Map.put(:password, DemoPassword.value())
    |> Account.registration_changeset()
    |> Repo.insert!()
    |> Account.profile_changeset(attrs)
    |> Repo.update!()
  end
end
