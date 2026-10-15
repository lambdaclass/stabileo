defmodule StabileoWeb.ErrorJSON do
  @moduledoc """
  Standard error responses.
  """

  def render("404.json", _assigns) do
    %{error: "not_found", message: "Resource not found"}
  end

  def render("500.json", _assigns) do
    %{error: "internal_error", message: "Internal server error"}
  end

  def render("400.json", %{reason: reason}) when is_binary(reason) do
    %{error: "bad_request", message: reason}
  end

  def render("400.json", _assigns) do
    %{error: "bad_request", message: "Bad request"}
  end

  def render("401.json", _assigns) do
    %{error: "unauthorized", message: "Authentication required"}
  end

  def render("403.json", _assigns) do
    %{error: "forbidden", message: "Permission denied"}
  end

  def render("422.json", %{changeset: changeset}) do
    %{
      error: "validation_error",
      message: "Validation failed",
      details: format_errors(changeset)
    }
  end

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Regex.replace(~r"%{(\w+)}", msg, fn _, key ->
        atom_key = safe_to_atom(key)
        opts |> Keyword.get(atom_key, key) |> to_string()
      end)
    end)
  end

  defp safe_to_atom(string) do
    String.to_existing_atom(string)
  rescue
    ArgumentError -> String.to_atom(string)
  end
end
