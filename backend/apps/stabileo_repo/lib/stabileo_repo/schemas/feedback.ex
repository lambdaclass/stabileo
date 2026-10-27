defmodule StabileoRepo.Schemas.Feedback do
  @moduledoc """
  A message sent from the app's feedback form: a bug, an idea or a question.
  `account_id` is set when the sender was signed in; `model_link` only when
  the sender chose to attach the model. Admins move it through `status`.
  """

  use StabileoRepo.Schema
  import Ecto.Changeset

  alias StabileoRepo.Schemas.Account

  @type t :: %__MODULE__{}

  @kinds ~w(bug idea question other)
  @statuses ~w(new read done)

  schema "feedback" do
    field(:kind, :string)
    field(:message, :string)
    field(:contact_email, :string)
    field(:page, :string)
    field(:app_version, :string)
    field(:user_agent, :string)
    field(:model_link, :string)
    field(:status, :string, default: "new")

    belongs_to(:account, Account)

    timestamps()
  end

  def kinds, do: @kinds
  def statuses, do: @statuses

  def create_changeset(feedback, attrs) do
    feedback
    |> cast(attrs, [
      :account_id,
      :kind,
      :message,
      :contact_email,
      :page,
      :app_version,
      :user_agent,
      :model_link
    ])
    |> update_change(:message, &String.trim/1)
    |> update_change(:contact_email, &(&1 |> String.trim() |> String.downcase()))
    |> validate_required([:kind, :message])
    |> validate_inclusion(:kind, @kinds)
    |> validate_length(:message, min: 1, max: 4000)
    |> validate_format(:contact_email, ~r/^[^\s@]+@[^\s@]+$/,
      message: "must have @ sign and no spaces"
    )
    |> validate_length(:contact_email, max: 255)
    |> validate_length(:page, max: 255)
    |> validate_length(:app_version, max: 32)
    |> validate_length(:model_link, max: 500_000)
    |> assoc_constraint(:account)
  end

  def status_changeset(feedback, attrs) do
    feedback
    |> cast(attrs, [:status])
    |> validate_required([:status])
    |> validate_inclusion(:status, @statuses)
  end
end
