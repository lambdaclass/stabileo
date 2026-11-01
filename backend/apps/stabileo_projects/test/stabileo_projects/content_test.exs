defmodule StabileoProjects.ContentTest do
  use ExUnit.Case, async: true

  alias StabileoProjects.Content

  defp pack(json), do: json |> :zlib.gzip() |> Base.encode64()

  test "decodes a gzipped JSON object into the gzip and its uncompressed size" do
    json = ~s({"version":"2.0","nodes":[1,2,3]})
    assert {:ok, gzip, size} = Content.decode(pack(json), 1_000, 1_000)
    assert :zlib.gunzip(gzip) == json
    assert size == byte_size(json)
    assert Content.encode(gzip) == pack(json) |> Base.decode64!() |> Base.encode64()
  end

  test "rejects what is not base64, not gzip, or not a JSON object" do
    assert {:error, :invalid} = Content.decode("%%%", 1_000, 1_000)
    assert {:error, :invalid} = Content.decode(Base.encode64("plain text"), 1_000, 1_000)
    assert {:error, :invalid} = Content.decode(pack("[1,2]"), 1_000, 1_000)
    assert {:error, :invalid} = Content.decode(pack("{not json"), 1_000, 1_000)
    assert {:error, :invalid} = Content.decode(nil, 1_000, 1_000)
  end

  test "stops inflating past the limit, so a small upload cannot expand into a huge one" do
    bomb = ~s({"pad":") <> String.duplicate("0", 5_000_000) <> ~s("})
    packed = pack(bomb)
    assert byte_size(packed) < 50_000
    assert {:error, :too_large} = Content.decode(packed, 100_000, 1_000_000)
  end

  test "rejects a compressed upload over its own limit" do
    assert {:error, :too_large} = Content.decode(pack(~s({"a":1})), 5, 1_000)
  end
end
