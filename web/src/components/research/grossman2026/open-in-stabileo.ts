/**
 * "Open in Stabileo": the current strip as an ordinary 2D model, handed to the editor through the
 * app's own share-link format (#data=2.<base64url(deflate(compact JSON))>, see
 * lib/utils/url-sharing.ts). The encoder is repeated here so this page does not import the
 * editor's stores.
 *
 * Scaling, as in research/metamaterials/grossman-2026/src/engine_model.rs: lengths in m, one
 * material with E = 1 MPa (1000 kN/m²), each bar's area A = k·ℓ m², so a bar's axial stiffness
 * E·A/ℓ is 1000 k kN/m and its axial force in kN is 1000 times the page's. Held rows become
 * pinned supports, the top row with the imposed vertical displacement. Prestress is not exported.
 */
import type { StripResult } from './springs';
// Only the current results version, read as a separate module (the query keeps it from becoming
// a chunk shared with the application, which must not grow by a byte).
import { currentResultsVersion } from '../../../lib/provenance/result-changes.json?research-page';

export function stripCompact(strip: StripResult, label: string, stamp?: unknown) {
  if (strip.prestress_force.some((force) => force !== 0)) throw new Error('Editor export does not support prestress or geometric stiffness.');
  const n = strip.nodes.map((p, i) => [i + 1, p[0], p[1]]);
  const sections: (string | number)[][] = [];
  const sectionOf = new Map<number, number>();
  const e = strip.bonds.map((b, i) => {
    const [pa, pb] = [strip.nodes[b[0]], strip.nodes[b[1]]];
    const area = strip.stiffness[i] * Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    const key = Number(area.toPrecision(12));
    let sid = sectionOf.get(key);
    if (sid === undefined) {
      sid = sections.length + 1;
      sectionOf.set(key, sid);
      sections.push([sid, `Spring ${sid}`, key, 1e-12]);
    }
    return [i + 1, 1, b[0] + 1, b[1] + 1, 1, sid];
  });
  const s: unknown[] = [];
  strip.held.forEach((h, i) => {
    if (!h) return;
    const [dx, dy] = strip.prescribed[i];
    const opt: Record<string, number> = {};
    if (dx) opt.dx = dx;
    if (dy) opt.dy = dy;
    s.push([s.length + 1, i + 1, 'pinned', ...(Object.keys(opt).length ? [opt] : [])]);
  });
  return {
    m: '2d',
    nm: label,
    lx: 'zUpStrongAxis',
    sv: 6,
    n,
    mt: [[1, 'Spring network (Stabileo Research): E·A/L = 1000 k kN/m', 1, 0, 0]],
    sc: sections,
    e,
    s,
    l: [],
    ni: [n.length + 1, 2, sections.length + 1, e.length + 1, s.length + 1, 1],
    _: { autoSolve: true, diagramType: 'axialColor', showDiagramValues: false },
    ...(stamp ? { sw: stamp } : {}),
  };
}

/** Raw DEFLATE, as fflate's deflateSync in the app (the browser's own compressor, no shared code). */
async function deflateRaw(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function stripShareHash(strip: StripResult, label: string, stamp?: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(stripCompact(strip, label, stamp)));
  return `#data=2.${base64url(await deflateRaw(bytes))}`;
}

export type StripLabel = { family: string; eta: number; keep: number; seed: number; strain: number };

function label(p: StripLabel): string {
  const what = p.family === 'foam' ? `foam η = ${p.eta.toFixed(2)}` : p.family;
  return `From Stabileo Research: spring network (${what}, bonds kept ${p.keep.toFixed(2)}, seed ${p.seed}, strain ${p.strain})`;
}

/** The share payload "2.<...>" of the strip, carrying the app's stamp for a fresh, unsolved project. */
async function payload(strip: StripResult, p: StripLabel): Promise<string> {
  // A project that carries no results, stamped with this build's results version (what the app's
  // freshStamp() gives a new project), so the editor does not present it as results solved by an
  // unknown older version. The editor solves it itself on opening.
  const stamp = { resultsVersion: currentResultsVersion, resultsSchemaVersion: 1, analyses: [] };
  return (await stripShareHash(strip, label(p), stamp)).slice('#data='.length);
}

/** The app in embed mode (ribbon and viewport, no header or footer) with the strip loaded. */
export async function embeddedEditorUrl(strip: StripResult, p: StripLabel, e2e = false): Promise<string> {
  return `${import.meta.env.BASE_URL}app/basic${e2e ? '?e2e=1' : ''}#embed=${await payload(strip, p)}`;
}

/** The full editor with the strip loaded, as an ordinary shared model. */
export async function fullEditorUrl(strip: StripResult, p: StripLabel): Promise<string> {
  return `${import.meta.env.BASE_URL}app/basic#data=${await payload(strip, p)}`;
}
