/**
 * The verdict of a CIRSOC 301 member check, and the readings over a datum the member does not state.
 *
 * ── A limit state not evaluated holds the member ────────────────────
 *
 * The engine (`cirsoc301_check.rs`, through `cirsoc301.ts`) refuses a check it cannot evaluate,
 * by name: E.4 without J or Cw, the flexure of a shape chapter F does not cover, tension rupture
 * without the end connection, an unknown shape. Such a check under load is `held`: never `ok`,
 * and never a failure with an infinite ratio either, since no capacity was computed to fail
 * against. The member reads `held` unless another check, one the engine evaluated, fails: that
 * failure is proven whatever the refused check would add.
 *
 * ── Rolled or welded, when the section does not say ─────────────────
 *
 * Fr (69 or 114 MPa, F.2.7), the flange cases of Tabla B.4.1 (1/2, 11/12), F.3.2a/b and the web
 * area of G.2 depend on whether the section is rolled or welded. When the section does not declare
 * it, the datum takes one of two values and nothing else, so the member is read with each and the
 * two verdicts compared: equal, it is that verdict, whichever the section is; different, the member
 * is held on the missing datum. This is an envelope over a finite set, not an assumption of
 * monotonicity: Mn is not monotonic in the fabrication (welded lowers FL but takes the case 12
 * limit, which can lie on either side of case 11's), so neither value is "the conservative one".
 *
 * ── The height of the load, when the member does not say ────────────
 *
 * F.2.2 has a pair of expressions per quantity, for a load on the web or the bottom flange
 * (F.2.4a/F.2.5a/F.2.6a) and on the top flange (F.2.4b/F.2.5b/F.2.6b). The top-flange ones are
 * never above the others: Lp takes 1,59 for 1,76, Lr = 1,28·ry·X1/FL is below
 * ry·X1/FL·√(1 + √(1 + X2·FL²)) ≥ 1,41·ry·X1/FL, Mcr = 1,28·Cb·Sx·X1/(Lb/ry) is below the √2·X1
 * form, and the inelastic interpolation between (Lp, Mp) and (Lr, Mr) only falls when Lp and Lr
 * fall. So Mn, and every ratio built on it, H.1 included, is monotonic in the load height: the
 * top-flange reading is a lower bound of the capacity. Undeclared, the member is read with the
 * load on the top flange; a pass there is a pass wherever the load acts. Only a failure there is
 * read again with the load on the web: failing too, it fails; passing, the member is held on the
 * datum (the verdict depends on where the load acts), never passed on the favourable reading.
 */
import type {
  SteelVerification, SteelStatus, SteelFabrication, SteelLoadHeight, SteelCheckNotEvaluated,
} from './cirsoc301';
import type { EngineMessage } from '../../../codes/message';

interface CheckLike { status: SteelStatus; ratio: number; clauseRef?: string; notEvaluatedMessage?: EngineMessage }

/** The check names a verification carries, in the order a reader meets them. */
const CHECKS = ['tension', 'compression', 'flexureZ', 'flexureY', 'shear', 'shearWeak', 'interaction'] as const;
type CheckName = (typeof CHECKS)[number];

function checksOf(v: Partial<Pick<SteelVerification, CheckName>>): Array<[CheckName, CheckLike]> {
  const out: Array<[CheckName, CheckLike]> = [];
  for (const k of CHECKS) { const c = v[k] as CheckLike | undefined; if (c) out.push([k, c]); }
  return out;
}

/** Every limit state the verification's checks left out under load, each tagged with its check. */
export function steelNotEvaluated(v: Partial<Pick<SteelVerification, CheckName>>): SteelCheckNotEvaluated[] {
  const out: SteelCheckNotEvaluated[] = [];
  const seen = new Set<string>();
  for (const [check, c] of checksOf(v)) {
    if (c.status !== 'held' || !c.notEvaluatedMessage) continue;
    const id = `${check}|${c.notEvaluatedMessage.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ check, clause: c.clauseRef ?? '', key: c.notEvaluatedMessage.key, ...(c.notEvaluatedMessage.params ? { params: c.notEvaluatedMessage.params } : {}), upperBound: false });
  }
  return out;
}

/**
 * The verdict of the checks: `fail` when a check the engine evaluated fails, `held` when one under
 * load was not evaluated, otherwise the worst of ok / warn.
 */
export function steelVerdict(v: Partial<Pick<SteelVerification, CheckName>>): SteelStatus {
  const s = checksOf(v).map(([, c]) => c.status);
  if (s.includes('fail')) return 'fail';
  if (s.includes('held')) return 'held';
  return s.includes('warn') ? 'warn' : 'ok';
}

/** The largest ratio among the checks that ran and were evaluated. */
export function steelRatio(v: Partial<Pick<SteelVerification, CheckName>>): number {
  const r = checksOf(v).filter(([, c]) => c.status !== 'held').map(([, c]) => c.ratio);
  return r.length ? Math.max(...r) : 0;
}

/** Whether a verdict approves the member (ok or near the limit). */
export const steelPasses = (s: SteelStatus): boolean => s === 'ok' || s === 'warn';

/** Ordering for «the worse of two verdicts»: a proven failure, then a hold, then the passes. */
export const steelSeverity = (s: SteelStatus): number => (s === 'fail' ? 3 : s === 'held' ? 2 : s === 'warn' ? 1 : 0);

/** The worse of two verifications of one member: by verdict, then by ratio. */
export function worseSteel<V extends SteelVerification>(a: V, b: V): V {
  const sa = steelSeverity(a.overallStatus), sb = steelSeverity(b.overallStatus);
  if (sa !== sb) return sb > sa ? b : a;
  return steelRatio(b) > steelRatio(a) ? b : a;
}

/** Whether the section's family has checks that read the fabrication (Fr, Tabla B.4.1 cases 1/2, 11/12, G.2's web). */
export function fabricationMatters(shape: string | undefined): boolean {
  return shape === 'I' || shape === 'H' || shape === 'U' || shape === 'T' || shape === 'box';
}

/** Whether the member's flexure reads the load height (F.2.2: doubly symmetric I and channels). */
export function loadHeightMatters(shape: string | undefined): boolean {
  return shape === 'I' || shape === 'H' || shape === 'U';
}

/** The closing line of a verification's steps. */
export function steelResultLine(s: SteelStatus): string {
  return s === 'held'
    ? `=== Resultado global: SIN VEREDICTO (hay estados límite no evaluados o un dato de la barra sin declarar) ===`
    : `=== Resultado global: ${s.toUpperCase()} ===`;
}

const word = (s: SteelStatus) => (s === 'held' ? 'sin veredicto' : s.toUpperCase());

/** `body` with header lines placed after its title line and its closing line rewritten for `status`. */
function withHeader<V extends SteelVerification>(body: V, header: string[], status: SteelStatus): V {
  const steps = [...body.steps];
  const at = Math.max(0, steps.findIndex((s) => s.startsWith('===')) + 1);
  steps.splice(at, 0, ...header, '');
  const last = steps.length - 1;
  if (steps[last]?.startsWith('=== Resultado global')) steps[last] = steelResultLine(status);
  return { ...body, steps };
}

function unionNotEvaluated(a: SteelVerification, b: SteelVerification): SteelCheckNotEvaluated[] {
  const ne = [...(a.notEvaluated ?? [])];
  for (const n of b.notEvaluated ?? []) if (!ne.some((m) => m.clause === n.clause && m.key === n.key && m.check === n.check)) ne.push(n);
  return ne;
}

/**
 * The member checked as rolled and as welded, when the section does not declare which: one
 * verdict when both agree, held on the datum when they do not. The body reported is the one with
 * the larger ratio, and the steps say both. `inputs` keeps both readings' inputs: a pass rests on both.
 */
export function combineFabrication<V extends SteelVerification>(rolled: V, welded: V): V {
  const sr = rolled.overallStatus, sw = welded.overallStatus;
  const rr = steelRatio(rolled), rw = steelRatio(welded);
  const same = sr === sw || (steelPasses(sr) && steelPasses(sw));
  const governs: 'rolled' | 'welded' = rw >= rr ? 'welded' : 'rolled';
  const body = governs === 'welded' ? welded : rolled;
  const fabrication: SteelFabrication = {
    basis: 'undeclared',
    rolled: { status: sr, ratio: rr },
    welded: { status: sw, ratio: rw },
    governs,
    dependsOnIt: !same,
  };
  const overallStatus: SteelStatus = same ? (steelPasses(sr) ? body.overallStatus : sr) : 'held';
  const header = [
    `Fabricación (laminado o soldado) no declarada en la sección: se verifica con las dos (Fr = 69 y 114 MPa, F.2.7; Tabla B.4.1, casos 1/2 y 11/12).`,
    `  Laminado: ${word(sr)}, η = ${rr.toFixed(3)}; soldado: ${word(sw)}, η = ${rw.toFixed(3)}.`,
    same
      ? `  El veredicto es el mismo con las dos; se muestra la verificación como ${governs === 'welded' ? 'soldado' : 'laminado'}, la de mayor η.`
      : `  El veredicto depende de si el perfil es laminado o soldado: falta declarar la fabricación de la sección. Se muestra la verificación como ${governs === 'welded' ? 'soldado' : 'laminado'}, la de mayor η.`,
  ];
  const ne = unionNotEvaluated(rolled, welded);
  const out = withHeader(body, header, overallStatus);
  return {
    ...out, overallStatus, fabrication,
    ...(ne.length ? { notEvaluated: ne } : {}),
    inputs: [...(rolled.inputs ?? []), ...(welded.inputs ?? [])],
  };
}

/**
 * The member read with the load on the top flange and, only where that reading fails, on the web
 * (see the header: the top flange is a lower bound of the capacity).
 */
export function combineLoadHeight<V extends SteelVerification>(top: V, web?: V): V {
  if (!web || steelPasses(top.overallStatus) || top.overallStatus === 'held') {
    const loadHeight: SteelLoadHeight = { basis: 'undeclared', top: { status: top.overallStatus, ratio: steelRatio(top) }, dependsOnIt: false };
    const header = [`Altura de la carga no declarada: se toma sobre el ala superior (F.2.4b, F.2.5b, F.2.6b), la lectura de menor capacidad; un resultado que verifica allí verifica con la carga en cualquier altura.`];
    return { ...withHeader(top, header, top.overallStatus), loadHeight };
  }
  const st = top.overallStatus, sw = web.overallStatus;
  const failsBoth = st === 'fail' && sw === 'fail';
  const overallStatus: SteelStatus = failsBoth ? 'fail' : 'held';
  const loadHeight: SteelLoadHeight = {
    basis: 'undeclared', top: { status: st, ratio: steelRatio(top) }, web: { status: sw, ratio: steelRatio(web) },
    dependsOnIt: !failsBoth,
  };
  const header = [
    `Altura de la carga no declarada: sobre el ala superior ${word(st)}, η = ${steelRatio(top).toFixed(3)}; sobre el alma ${word(sw)}, η = ${steelRatio(web).toFixed(3)}.`,
    failsBoth
      ? `  No verifica con la carga en ninguna de las dos alturas.`
      : `  El veredicto depende de dónde actúa la carga: falta declarar su altura en la barra. Se muestra la lectura con la carga sobre el ala superior.`,
  ];
  const ne = unionNotEvaluated(top, web);
  return {
    ...withHeader(top, header, overallStatus), overallStatus, loadHeight,
    ...(ne.length ? { notEvaluated: ne } : {}),
    inputs: [...(top.inputs ?? []), ...(web.inputs ?? [])],
  };
}
