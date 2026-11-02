/** The paper's inline text as segments: `*italic*`, `**bold**`, `$TeX$` and `[^1]` / `[^4,5]` citations. */
export type Segment =
  | { k: 'text'; t: string }
  | { k: 'i'; t: string }
  | { k: 'b'; t: string }
  | { k: 'math'; tex: string }
  | { k: 'cite'; n: number[] };

const TOKEN = /\$([^$]+)\$|\[\^([\d,]+)\]|\*\*([^*]+)\*\*|\*([^*]+)\*/g;

export function segments(s: string): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const m of s.matchAll(TOKEN)) {
    if (m.index! > at) out.push({ k: 'text', t: s.slice(at, m.index) });
    if (m[1] !== undefined) out.push({ k: 'math', tex: m[1] });
    else if (m[2] !== undefined) out.push({ k: 'cite', n: m[2].split(',').map(Number) });
    else if (m[3] !== undefined) out.push({ k: 'b', t: m[3] });
    else out.push({ k: 'i', t: m[4]! });
    at = m.index! + m[0].length;
  }
  if (at < s.length) out.push({ k: 'text', t: s.slice(at) });
  return out;
}
