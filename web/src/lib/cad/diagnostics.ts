// Pre-Apply draft diagnostics (PR [14] Layer 1).
//
// Pure, read-only analysis of a generated RcDraftResult (it never mutates the
// snapshot — connectivity here is computed independently of infer.pruneFloating).
// Turns the silent failure modes the audit found on real DXFs into an explicit,
// human-readable verdict the wizard shows BEFORE the user can Apply:
//
//   - degenerate unit collapse (a mm-header metre drawing welds to ~nothing),
//   - zero slabs / zero area loads (a frame that carries no gravity load),
//   - disconnected / floating structure (more than one connected component),
//   - orphan nodes (referenced by nothing) / members not tied to the structure,
//   - unsupported structure (no base supports, or a part with no support).
//
// The verdict level gates trust, not Apply: review-before-apply is preserved,
// and the user may still Apply a 'warn'/'error' draft deliberately — but never
// without seeing why.

import type { RcDraftResult } from './types';
import type { ModelSnapshot } from '../store/history.svelte';

export type DiagnosticLevel = 'ok' | 'warn' | 'error';

export interface DiagnosticCheck {
  /** Stable id → i18n key `cad.diag.<id>` in the wizard. */
  id: string;
  level: DiagnosticLevel;
  /** Numeric substitutions for the localized message ({n}, {a}, {b}). */
  values?: Record<string, number>;
}

export interface DraftDiagnostics {
  /** Worst level across all checks ('ok' when every check passed). */
  level: DiagnosticLevel;
  checks: DiagnosticCheck[];
  /** True when the draft is a single connected, supported, load-bearing model. */
  solvableShape: boolean;
}

const worst = (a: DiagnosticLevel, b: DiagnosticLevel): DiagnosticLevel =>
  a === 'error' || b === 'error' ? 'error' : a === 'warn' || b === 'warn' ? 'warn' : 'ok';

/** Connected components over frame elements + quad edges (read-only). */
function connectedComponents(snap: ModelSnapshot): { count: number; largest: number; total: number } {
  const total = snap.nodes.length;
  if (total === 0) return { count: 0, largest: 0, total: 0 };
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  };
  for (const [, e] of snap.elements) link(e.nodeI, e.nodeJ);
  for (const [, q] of snap.quads ?? []) {
    for (let i = 0; i < 4; i++) link(q.nodes[i], q.nodes[(i + 1) % 4]);
  }
  const seen = new Set<number>();
  let count = 0, largest = 0;
  for (const [, n0] of snap.nodes) {
    if (seen.has(n0.id)) continue;
    count++;
    let size = 0;
    const stack = [n0.id];
    while (stack.length) {
      const n = stack.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      size++;
      for (const m of adj.get(n) ?? []) if (!seen.has(m)) stack.push(m);
    }
    if (size > largest) largest = size;
  }
  return { count, largest, total };
}

/**
 * Diagnose a generated draft. `result` is the output of generateRcDraft;
 * nothing is mutated. Returns an ordered list of checks plus the worst level.
 */
export function diagnoseDraft(result: RcDraftResult): DraftDiagnostics {
  const snap = result.snapshot;
  const c = result.counts;
  const checks: DiagnosticCheck[] = [];
  const add = (id: string, level: DiagnosticLevel, values?: Record<string, number>) =>
    checks.push({ id, level, values });

  // 1) Degenerate collapse — almost no nodes survived (wrong unit / everything
  //    welded together). A real plan never reduces to a handful of nodes.
  const nNodes = snap.nodes.length;
  if (nNodes <= 2) {
    add('degenerate', 'error', { n: nNodes });
  } else if (nNodes < 6 && (c.columns + c.beams) <= 2) {
    add('degenerate', 'warn', { n: nNodes });
  }

  // 2) Frame present at all. Wall shells are first-class structure in this
  //    pipeline (a supported wall-only model is valid), so they count too.
  if (c.columns === 0 && c.beams === 0 && c.wallQuads === 0) {
    add('noFrame', 'error');
  }

  // 3) Slabs / area loads — a gravity model that carries nothing.
  const areaLoads = snap.loads.filter((l) => (l.data as { quadId?: number }).quadId !== undefined).length;
  if (c.slabQuads === 0) {
    add('noSlabs', c.beams > 0 || c.wallQuads > 0 ? 'warn' : 'error');
  }
  if (areaLoads === 0 && c.slabQuads === 0) {
    add('noAreaLoads', 'warn');
  } else if (areaLoads === 0 && c.slabQuads > 0) {
    // Shells exist but nothing loads them — usually D=L=0 by mistake.
    add('slabsNoLoad', 'warn', { n: c.slabQuads });
  }

  // 4) Supports.
  if (snap.supports.length === 0) {
    add('noSupports', 'error');
  }

  // 5) Connectivity — one connected graph is the app's pre-solve requirement.
  const comp = connectedComponents(snap);
  if (comp.count > 1) {
    add('disconnected', 'error', { n: comp.count, orphans: comp.total - comp.largest });
  }

  // 6) Orphan nodes — referenced by no element, quad, or support.
  const used = new Set<number>();
  for (const [, e] of snap.elements) { used.add(e.nodeI); used.add(e.nodeJ); }
  for (const [, q] of snap.quads ?? []) for (const n of q.nodes) used.add(n);
  for (const [, s] of snap.supports) used.add(s.nodeId);
  const orphans = snap.nodes.filter(([, n]) => !used.has(n.id)).length;
  if (orphans > 0) add('orphanNodes', 'warn', { n: orphans });

  // 7) Floating member ends (from generation) — surfaced as a diagnostic too.
  //    Multi-floor composition concatenates one warning per range, so sum them
  //    all rather than reading only the first (.find would under-report n).
  const floatingEnds = result.warnings
    .filter((w) => w.message.startsWith('beamEndsFloating:'))
    .reduce((sum, w) => sum + (Number(w.message.split(':')[1]) || 0), 0);
  if (floatingEnds > 0) {
    add('floatingEnds', 'warn', { n: floatingEnds });
  }

  // 8) Skipped / isolated slabs.
  if (c.slabsIsolated > 0) add('isolatedSlabs', 'warn', { n: c.slabsIsolated });
  if (c.slabsSkipped > 0) add('skippedSlabs', 'warn', { n: c.slabsSkipped });

  const level = checks.reduce((acc, ck) => worst(acc, ck.level), 'ok' as DiagnosticLevel);
  const solvableShape =
    level !== 'error' && comp.count === 1 && snap.supports.length > 0 &&
    (c.columns + c.beams + c.wallQuads) > 0;

  if (checks.length === 0) add('clean', 'ok');

  return { level, checks, solvableShape };
}
