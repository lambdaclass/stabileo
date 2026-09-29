/**
 * Display mathematics for a narrow panel. Two results side by side (FEM_ij = …, \qquad FEM_ji = …) read well on a
 * page and run off a side panel. On a narrow panel the expressions a
 * `\qquad` separates at the top level are stacked, one per line, and a
 * long chain of equalities (δ = (u_J − u_I)·ê = Δu_x cos α + …) is broken
 * at its equal signs, lined up.
 */

function topLevel(tex: string, token: string): string[] {
  const parts: string[] = [];
  let depth = 0, last = 0;
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 0 && tex.startsWith(token, i)) { parts.push(tex.slice(last, i)); last = i + token.length; }
  }
  parts.push(tex.slice(last));
  return parts;
}
const LONG = 64;
function breakAtEquals(part: string): string {
  if (part.length < LONG || part.includes('\\begin')) return part;
  const sides = topLevel(part, '=');
  if (sides.length < 3) return part;
  const [first, ...rest] = sides.map((x) => x.trim());
  return `\\begin{aligned} ${first} &= ${rest.join(' \\\\ &= ')} \\end{aligned}`;
}
/** The same mathematics laid out for a panel a few hundred pixels wide. */
export function narrowTex(tex: string): string {
  if (!tex.includes('\\qquad')) return breakAtEquals(tex);
  const parts = topLevel(tex, '\\qquad');
  const clean = parts.map((p) => p.trim().replace(/,$/, '').replace(/^\\;|\\;$/g, '').trim()).filter(Boolean).map(breakAtEquals);
  if (clean.length < 2) return clean[0] ?? tex;
  return `\\begin{gathered} ${clean.join(' \\\\ ')} \\end{gathered}`;
}

