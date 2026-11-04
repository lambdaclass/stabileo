/**
 * Hooks where a straight bar does not anchor: the verifier names each bottom group that continues
 * into a support without its ld but within its ldh (`anchorHook` on an Anchorage check), and the
 * design gives that group a standard hook toward that support. The groups become explicit with
 * the continuity they had, so the hook travels with the bars to the detailing and the drawings.
 */
import type { ProvidedReinforcement } from '../../design-contract/reinforcement';
import type { ProvidedRebarCheck, ProvidedRebarResult } from '../station-design-forces';
import type { DesignCodeAdapter } from './code-adapter';
import type { MemberContext } from './member-context';
import { resolveBarGroups, resolveLayers } from '../station-design-forces';

type Hook = NonNullable<ProvidedRebarCheck['anchorHook']>;

/** The hooks a verdict asks for, on the bottom bars into the supports. */
export function hooksAsked(checks: readonly ProvidedRebarCheck[]): Hook[] {
  return checks.filter((c) => c.anchorHook && c.anchorHook.face === 'bottom').map((c) => c.anchorHook!);
}

/** The arrangement with those hooks. Null when there is nothing to add. */
export function withHooks(r: ProvidedReinforcement, hooks: readonly Hook[]): ProvidedReinforcement | null {
  if (hooks.length === 0) return null;
  const reg = { ...(r.regions ?? {}) };
  const layers = resolveLayers(reg.bottomSpanLayers, reg.bottomSpan ?? r.bottom);
  const groups = resolveBarGroups(reg.bottomGroups, layers, reg.continuity?.bottomIntoStart !== false, reg.continuity?.bottomIntoEnd !== false)
    .map((g) => ({ ...g, layers: g.layers.map((l) => ({ ...l })) }));
  let changed = false;
  for (const h of hooks) {
    const g = groups[h.group];
    if (!g) continue;
    const key = h.toward === 'start' ? 'anchorageStart' : 'anchorageEnd';
    if (g[key] !== 'hook') { g[key] = 'hook'; changed = true; }
  }
  return changed ? { ...r, regions: { ...reg, bottomGroups: groups } } : null;
}

/**
 * A beam's accepted arrangement with the hooks its verdict asks for, when it still passes with
 * them: the one step the design and the final-geometry repair share.
 */
export function completeAnchorage(
  adapter: DesignCodeAdapter, ctx: MemberContext, reinf: ProvidedReinforcement, verdict: ProvidedRebarResult,
  passes: (v: ProvidedRebarResult) => boolean,
): { reinf: ProvidedReinforcement; verdict: ProvidedRebarResult; verified: boolean } {
  if (ctx.elementType !== 'beam') return { reinf, verdict, verified: false };
  const hooked = withHooks(reinf, hooksAsked(verdict.checks));
  if (!hooked) return { reinf, verdict, verified: false };
  const v = adapter.verify(ctx, hooked);
  return passes(v) ? { reinf: hooked, verdict: v, verified: true } : { reinf, verdict, verified: true };
}
