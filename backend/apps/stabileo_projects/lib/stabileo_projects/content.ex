defmodule StabileoProjects.Content do
  @moduledoc """
  A project's document travels gzipped and base64-encoded, and is stored as
  the gzip. Decoding inflates at most `max_bytes`, so a small upload cannot
  expand into a huge one, and requires a JSON object.
  """

  def decode(encoded, max_compressed, max_bytes) when is_binary(encoded) do
    with {:ok, gzip} <- base64(encoded),
         :ok <- within(byte_size(gzip), max_compressed),
         {:ok, json} <- inflate(gzip, max_bytes),
         {:ok, %{}} <- json_object(json) do
      {:ok, gzip, byte_size(json)}
    end
  end

  def decode(_encoded, _max_compressed, _max_bytes), do: {:error, :invalid}

  def encode(gzip), do: Base.encode64(gzip)

  defp base64(encoded) do
    case Base.decode64(encoded) do
      {:ok, gzip} -> {:ok, gzip}
      :error -> {:error, :invalid}
    end
  end

  defp within(size, max) when size <= max, do: :ok
  defp within(_size, _max), do: {:error, :too_large}

  defp inflate(gzip, max_bytes) do
    z = :zlib.open()

    try do
      :ok = :zlib.inflateInit(z, 31)
      collect(z, :zlib.safeInflate(z, gzip), [], 0, max_bytes)
    rescue
      _ -> {:error, :invalid}
    after
      :zlib.close(z)
    end
  end

  defp collect(z, {state, chunk}, acc, size, max) do
    size = size + IO.iodata_length(chunk)

    cond do
      size > max -> {:error, :too_large}
      state == :finished -> {:ok, IO.iodata_to_binary(Enum.reverse([chunk | acc]))}
      true -> collect(z, :zlib.safeInflate(z, []), [chunk | acc], size, max)
    end
  end

  defp json_object(json) do
    case Jason.decode(json) do
      {:ok, %{} = map} -> {:ok, map}
      _ -> {:error, :invalid}
    end
  end
end
