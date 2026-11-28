/** A memo of designs by a key of everything they read, emptied whole once it holds `limit` of them. */
export function designMemo<T>(limit = 2000): (key: string, make: () => T) => T {
  const memo = new Map<string, T>();
  return (key, make) => {
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const value = make();
    if (memo.size >= limit) memo.clear();
    memo.set(key, value);
    return value;
  };
}

/** The key a design is memoised by: the inputs as JSON, and how the format writes a number, which its texts carry. */
export const designKey = (fmt: (v: number, digits?: number) => string, ...inputs: unknown[]): string => JSON.stringify([fmt(1234.5, 1), ...inputs]);
