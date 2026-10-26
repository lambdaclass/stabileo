/**
 * The works by construction phases.
 *
 *  · A phase has a name, a start date and a duration in days; the members and shells it builds are
 *    assigned to it by key (`g<id>` a physical element, `e<id>` a member, `q<id>`/`p<id>` a shell).
 *  · `phasesByLevel` proposes the usual sequence: the foundations, then for each level the columns
 *    and walls that reach it and then its beams and slabs, one after the other from a start date,
 *    each with the same duration (the person changes them).
 *  · Auxiliary means and collective protections are measured per level from the slabs it builds:
 *    the perimeter guardrail along the slab edges, the safety net and the façade scaffold over the
 *    perimeter and the storey height, the shoring under the slab's area; they go with the phase
 *    that builds the level's slab.
 *  · `stagesFromPhases` turns the phases into the stages of the staged construction analysis.
 */
export interface Phase { id: string; name: string; start: string; days: number }
export interface SiteData { phases: Phase[]; assign: Record<string, string> }

export interface SiteMember { key: string; kind: 'vertical' | 'horizontal' | 'foundation'; zBottom: number; zTop: number }

const addDays = (iso: string, d: number) => { const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };
export const phaseEnd = (p: Phase) => addDays(p.start, p.days);

/** The usual sequence by level, from `start`, `days` per phase. Names are i18n keys with params. */
export function phasesByLevel(levels: ReadonlyArray<{ name: string; z: number }>, members: readonly SiteMember[], start: string, days: number, tol = 0.05): { phases: Array<Phase & { nameKey: string; params: Record<string, string> }>; assign: Record<string, string> } {
  const phases: Array<Phase & { nameKey: string; params: Record<string, string> }> = [], assign: Record<string, string> = {};
  let date = start, n = 0;
  const open = (nameKey: string, params: Record<string, string>) => { const p = { id: `ph${++n}`, name: '', nameKey, params, start: date, days }; phases.push(p); date = addDays(date, days); return p; };
  const found = members.filter((m) => m.kind === 'foundation');
  if (found.length) { const p = open('site.phase.foundations', {}); for (const m of found) assign[m.key] = p.id; }
  for (const lv of [...levels].filter((l) => l.z > tol).sort((a, b) => a.z - b.z)) {
    const verticals = members.filter((m) => m.kind === 'vertical' && Math.abs(m.zTop - lv.z) < tol);
    const horizontals = members.filter((m) => m.kind === 'horizontal' && Math.abs(m.zTop - lv.z) < tol);
    if (verticals.length) { const p = open('site.phase.verticals', { level: lv.name }); for (const m of verticals) assign[m.key] = p.id; }
    if (horizontals.length) { const p = open('site.phase.horizontals', { level: lv.name }); for (const m of horizontals) assign[m.key] = p.id; }
  }
  // Anything left (a member between levels): the phase of the level it reaches.
  for (const m of members) if (!assign[m.key]) { const p = phases.find((x) => x.params.level !== undefined) ?? phases[0]; if (p) assign[m.key] = p.id; }
  return { phases, assign };
}

/** Phases in order of start, the keys each builds and those built before it. */
export function builtBy(site: SiteData): Array<{ phase: Phase; keys: string[]; before: string[] }> {
  const order = [...site.phases].sort((a, b) => a.start.localeCompare(b.start) || site.phases.indexOf(a) - site.phases.indexOf(b));
  const before: string[] = [];
  return order.map((phase) => {
    const keys = Object.entries(site.assign).filter(([, id]) => id === phase.id).map(([k]) => k);
    const out = { phase, keys, before: [...before] };
    before.push(...keys);
    return out;
  });
}

export type SafetyKind = 'guardrail' | 'net' | 'scaffold' | 'shoring';
export interface SafetyItem { kind: SafetyKind; unit: 'm' | 'm2'; quantity: number; level: string; phaseId?: string }

/** Guardrail, net, scaffold and shoring of a level from its slabs' perimeter and area and the storey height. */
export function safetyItems(level: string, slabs: ReadonlyArray<{ perimeter: number; area: number }>, storeyHeight: number, phaseId?: string): SafetyItem[] {
  const per = slabs.reduce((s, x) => s + x.perimeter, 0), area = slabs.reduce((s, x) => s + x.area, 0);
  if (!(per > 0)) return [];
  const at = (kind: SafetyKind, unit: SafetyItem['unit'], quantity: number): SafetyItem => ({ kind, unit, quantity, level, ...(phaseId ? { phaseId } : {}) });
  return [at('guardrail', 'm', per), at('net', 'm2', per * storeyHeight), at('scaffold', 'm2', per * storeyHeight), at('shoring', 'm2', area)];
}

/** The phases as the stages of the staged construction analysis: what each adds; the first applies every case. */
export function stagesFromPhases(site: SiteData, expand: (key: string) => { elements: number[]; plates: number[]; quads: number[] }, caseIds: readonly number[]) {
  return builtBy(site).filter((b) => b.keys.length).map((b, i) => {
    const parts = b.keys.map(expand);
    return {
      name: b.phase.name,
      elementsAdded: parts.flatMap((p) => p.elements), elementsRemoved: [] as number[],
      platesAdded: parts.flatMap((p) => p.plates), platesRemoved: [] as number[],
      quadsAdded: parts.flatMap((p) => p.quads), quadsRemoved: [] as number[],
      caseIds: i === 0 ? [...caseIds] : [],
    };
  });
}
