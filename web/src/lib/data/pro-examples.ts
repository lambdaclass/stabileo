/**
 * The PRO example catalogue.
 *
 * ── What an entry says ─────────────────────────────────────────────
 *
 * Every example is a structure chosen to teach one thing, so a card says what it is, what it is
 * for, and what to look at once it is solved. Its texts are keyed by its id (`ex.<id>`,
 * `.desc`, `.purpose`, `.look`), in es, en and pt.
 *
 * The groups run from small to large, and so does each group: a first frame before a building,
 * a building before a tower of a thousand nodes.
 *
 * ── Measured, not declared ─────────────────────────────────────────
 *
 * `stats` are the sizes printed on the card, so a reader can tell a 20-member frame from a
 * 3 400-member tower before waiting for it. A test loads every example and holds them to the
 * model it loads; the heavy-model warning is taken from them.
 *
 * ── What loading does ──────────────────────────────────────────────
 *
 * The model is loaded (a fixture, or model code), its own corrections are applied
 * (`pro-example-fixes.ts`), the cases with no load are dropped, the self-weight is stated as the
 * example asks, and the combinations are built as the example asks: CIRSOC 101-2025's strength
 * combinations over the loaded cases, with wind and earthquake in both senses unless the cases
 * already carry their sign, or the example's own.
 */

import { modelStore } from '../store/model.svelte';
import { windCaseReversible } from '../store/wind-reversal';
import { generateCombinations } from '../codes/cirsoc101/combinations';
import { expandCombinations, presentSymbols } from '../engine/loads/combination-cases';
import { addGeneratedCombinations } from '../store/generated-combinations';
import { loadCodeExample, type CodeExampleId } from '../templates/examples';
import { PRO_EXAMPLE_FIXES } from './pro-example-fixes';

export type ExampleGroup =
  | 'firstSteps' | 'buildings' | 'cad' | 'industrial' | 'towers' | 'longspan' | 'foundations' | 'showcase';

/** The order the groups are shown in: from the first model to the ones that stress the app. */
export const PRO_EXAMPLE_GROUP_ORDER: readonly ExampleGroup[] =
  ['firstSteps', 'buildings', 'cad', 'industrial', 'towers', 'longspan', 'foundations', 'showcase'] as const;

/**
 * The self-weight an example gets: every member and shell, none (a model whose dead load already
 * holds it), or its shells only (a slab whose ribs overlap it).
 */
export type ExampleSelfWeight = 'all' | 'none' | 'shells';

/**
 * Its combinations: the regulation's with wind and earthquake in both senses, the regulation's
 * with the cases as signed (a model that already has +X and −X), or its own.
 */
export type ExampleCombinations = 'regulation' | 'regulationAsSigned' | 'own';

export interface ProExample {
  id: string;
  source: 'fixture' | 'code';
  group: ExampleGroup;
  nameKey: string;
  descKey: string;
  purposeKey: string;
  lookKey: string;
  groupKey: string;
  tags: string[];
  stats: { nodes: number; members: number; shells?: number };
  selfWeight: ExampleSelfWeight;
  combinations: ExampleCombinations;
  load: () => Promise<void>;
}

/** One heading with its cards, ready to render. */
export interface ProExampleGroup {
  group: ExampleGroup;
  title: string;
  examples: ProExample[];
}

const GROUP_KEYS: Record<ExampleGroup, string> = {
  firstSteps: 'pro.examples.groupFirstSteps',
  buildings: 'pro.examples.groupBuildings',
  cad: 'pro.examples.groupCad',
  industrial: 'pro.examples.groupSheds',
  towers: 'pro.examples.groupTowers',
  longspan: 'pro.examples.groupLongSpan',
  foundations: 'pro.examples.groupFoundations',
  showcase: 'pro.examples.groupShowcase',
};

/** Cases that carry nothing, dropped so no combination is built over an empty action. */
function dropEmptyCases(keep: number | undefined): void {
  const loaded = new Set(modelStore.loads.map((l) => (l.data as { caseId?: number }).caseId ?? 1));
  for (const c of [...modelStore.model.loadCases]) if (!loaded.has(c.id) && c.id !== keep) modelStore.removeLoadCase(c.id);
}

function stateSelfWeight(rule: ExampleSelfWeight, deadCase: number | undefined): void {
  if (rule === 'none' || deadCase === undefined) { modelStore.adoptAnalysis({ selfWeight: [] }); return; }
  const gravity = { caseId: deadCase, direction: 'Z' as const, factor: -1 };
  if (rule === 'all') { modelStore.adoptAnalysis({ selfWeight: [gravity] }); return; }
  const quads = [...modelStore.quads.keys()], plates = [...modelStore.plates.keys()];
  const groupId = modelStore.addGroup('Losa (peso propio)', 'custom', { elements: [], quads, plates } as never);
  modelStore.adoptAnalysis({ selfWeight: [{ ...gravity, groupId }] });
}

function regulationCombinations(bothSenses: boolean): void {
  const cases = modelStore.model.loadCases;
  if (!cases.some((c) => (c.type || '').toUpperCase() === 'D')) return;
  const specs = generateCombinations({ present: presentSymbols(cases) });
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  let n = 0;
  // Wind reversed only where that is exact: an example's roof-suction case is not.
  addGeneratedCombinations(expandCombinations(specs, cases, {
    bothSenses: { W: bothSenses, E: bothSenses },
    reversible: (caseId) => windCaseReversible(modelStore.model, caseId),
  }), () => `U${++n}: `);
}

async function loadExample(ex: ProExample): Promise<void> {
  if (ex.source === 'code') await loadCodeExample(ex.id as CodeExampleId);
  else await modelStore.loadExample(ex.id);
  modelStore.batch(() => {
    PRO_EXAMPLE_FIXES[ex.id]?.();
    // A model written as code states its own self-weight rule; a fixture gets the example's.
    const stated = ex.source === 'code' ? modelStore.analysis?.selfWeight : undefined;
    const dead = stated?.[0]?.caseId ?? modelStore.model.loadCases.find((c) => (c.type || '').toUpperCase() === 'D')?.id;
    dropEmptyCases(ex.selfWeight === 'none' ? undefined : dead);
    if (!stated) stateSelfWeight(ex.selfWeight, dead);
    if (ex.combinations !== 'own') regulationCombinations(ex.combinations === 'regulation');
  });
}

type Entry = Omit<ProExample, 'nameKey' | 'descKey' | 'purposeKey' | 'lookKey' | 'groupKey' | 'load'>;

const entry = (e: Entry): ProExample => {
  const ex: ProExample = {
    ...e,
    nameKey: `ex.${e.id}`, descKey: `ex.${e.id}.desc`, purposeKey: `ex.${e.id}.purpose`, lookKey: `ex.${e.id}.look`,
    groupKey: GROUP_KEYS[e.group],
    load: () => loadExample(ex),
  };
  return ex;
};

export const PRO_EXAMPLES: readonly ProExample[] = [
  // ── First steps ──
  entry({ id: 'pro-plane-frame-seismic', source: 'code', group: 'firstSteps', tags: ['pro.tagSteel', 'pro.tagSeismic'], stats: { nodes: 20, members: 28 }, selfWeight: 'all', combinations: 'regulation' }),
  entry({ id: 'rc-qa-diagnostic', source: 'fixture', group: 'firstSteps', tags: ['pro.tagRC', 'pro.tagCombinations'], stats: { nodes: 18, members: 26 }, selfWeight: 'all', combinations: 'regulationAsSigned' }),
  entry({ id: '3d-building', source: 'fixture', group: 'firstSteps', tags: ['pro.tagRC', 'pro.tagDrift'], stats: { nodes: 54, members: 105 }, selfWeight: 'all', combinations: 'regulation' }),

  // ── Buildings ──
  entry({ id: 'pro-rc-frame-area-loads', source: 'code', group: 'buildings', tags: ['pro.tagRC', 'pro.tagFloorLoads'], stats: { nodes: 59, members: 113 }, selfWeight: 'all', combinations: 'regulation' }),
  entry({ id: 'pro-edificio-7p', source: 'fixture', group: 'buildings', tags: ['pro.tagRC', 'pro.tagShells'], stats: { nodes: 141, members: 203, shells: 77 }, selfWeight: 'all', combinations: 'regulationAsSigned' }),
  entry({ id: 'rc-design-frame', source: 'fixture', group: 'buildings', tags: ['pro.tagRC', 'pro.tagDesign'], stats: { nodes: 180, members: 408 }, selfWeight: 'all', combinations: 'regulation' }),
  entry({ id: 'pro-steel-building-slabs', source: 'code', group: 'buildings', tags: ['pro.tagSteel', 'pro.tagShells'], stats: { nodes: 836, members: 447, shells: 756 }, selfWeight: 'all', combinations: 'regulation' }),
  entry({ id: 'torre-irregular-con-retiros', source: 'fixture', group: 'buildings', tags: ['pro.tagSteel', 'pro.tagDrift'], stats: { nodes: 556, members: 1432 }, selfWeight: 'all', combinations: 'regulation' }),

  // ── From CAD ── their dead load holds the slab's weight, and their provenance lists the
  // combinations they were drafted with.
  entry({ id: 'cad-arch-structure-dxf', source: 'fixture', group: 'cad', tags: ['pro.tagRC', 'pro.tagCad'], stats: { nodes: 1681, members: 840, shells: 870 }, selfWeight: 'none', combinations: 'own' }),
  entry({ id: 'cad-arch-only-dxf', source: 'fixture', group: 'cad', tags: ['pro.tagRC', 'pro.tagCad'], stats: { nodes: 794, members: 1000, shells: 660 }, selfWeight: 'none', combinations: 'own' }),

  // ── Sheds and industrial buildings ──
  entry({ id: 'pro-simple-shed', source: 'code', group: 'industrial', tags: ['pro.tagSteel', 'pro.tagWind'], stats: { nodes: 80, members: 197 }, selfWeight: 'all', combinations: 'regulation' }),
  entry({ id: 'pipe-rack', source: 'fixture', group: 'industrial', tags: ['pro.tagSteel', 'pro.tagIndustrial'], stats: { nodes: 64, members: 156 }, selfWeight: 'all', combinations: 'regulation' }),
  entry({ id: '3d-nave-industrial', source: 'fixture', group: 'industrial', tags: ['pro.tagSteel', 'pro.tagCrane'], stats: { nodes: 232, members: 709 }, selfWeight: 'all', combinations: 'regulation' }),
  entry({ id: 'pro-concrete-wall-storehouse', source: 'code', group: 'industrial', tags: ['pro.tagRC', 'pro.tagShells'], stats: { nodes: 480, members: 317, shells: 288 }, selfWeight: 'all', combinations: 'regulation' }),
  entry({ id: 'pro-crane-hangar', source: 'code', group: 'industrial', tags: ['pro.tagCrane', 'pro.tagPDelta'], stats: { nodes: 222, members: 467 }, selfWeight: 'all', combinations: 'own' }),

  // ── Towers ──
  entry({ id: 'pro-guyed-tower', source: 'code', group: 'towers', tags: ['pro.tagCables', 'pro.tagTensionOnly'], stats: { nodes: 90, members: 261 }, selfWeight: 'all', combinations: 'regulation' }),
  // The platform's "E" is wave and current, not an earthquake: it keeps its own combinations.
  entry({ id: 'offshore-platform', source: 'fixture', group: 'towers', tags: ['pro.tagSteel', 'pro.tagOffshore'], stats: { nodes: 196, members: 762 }, selfWeight: 'all', combinations: 'own' }),
  entry({ id: 'xl-diagrid-tower', source: 'fixture', group: 'towers', tags: ['pro.tagScale', 'pro.tagDrift'], stats: { nodes: 1090, members: 3434 }, selfWeight: 'all', combinations: 'regulation' }),

  // ── Bridges and long spans ──
  entry({ id: 'cable-stayed-bridge', source: 'fixture', group: 'longspan', tags: ['pro.tagCables', 'pro.tagBridge'], stats: { nodes: 74, members: 125 }, selfWeight: 'all', combinations: 'regulation' }),
  entry({ id: 'geodesic-dome', source: 'fixture', group: 'longspan', tags: ['pro.tagRoof', 'pro.tagLattice'], stats: { nodes: 337, members: 961 }, selfWeight: 'all', combinations: 'regulation' }),
  entry({ id: 'full-stadium', source: 'fixture', group: 'longspan', tags: ['pro.tagRoof', 'pro.tagBowl'], stats: { nodes: 360, members: 876, shells: 144 }, selfWeight: 'all', combinations: 'regulation' }),
  entry({ id: 'suspension-bridge', source: 'fixture', group: 'longspan', tags: ['pro.tagCables', 'pro.tagBridge'], stats: { nodes: 378, members: 932 }, selfWeight: 'all', combinations: 'regulation' }),

  // ── Foundations ── the ribs lie inside the slab: only the slab's weight is counted.
  entry({ id: 'mat-foundation', source: 'fixture', group: 'foundations', tags: ['pro.tagFoundation', 'pro.tagSoil'], stats: { nodes: 72, members: 127, shells: 56 }, selfWeight: 'shells', combinations: 'regulation' }),

  // ── Showcase ──
  entry({ id: 'la-bombonera', source: 'fixture', group: 'showcase', tags: ['pro.tagBowl', 'pro.tagScale'], stats: { nodes: 1005, members: 2476, shells: 120 }, selfWeight: 'all', combinations: 'regulation' }),
];

/**
 * The catalogue grouped for display, in `PRO_EXAMPLE_GROUP_ORDER`, each group from its smallest
 * model to its largest. A group with no examples is dropped rather than rendered empty.
 */
export function proExampleGroups(translate: (key: string) => string): ProExampleGroup[] {
  return PRO_EXAMPLE_GROUP_ORDER.map((group) => ({
    group,
    title: translate(GROUP_KEYS[group]),
    // Small to large within a group; `sort` is stable, so equal sizes keep the listed order.
    examples: PRO_EXAMPLES.filter((ex) => ex.group === group).sort((a, b) => a.stats.nodes - b.stats.nodes),
  })).filter((g) => g.examples.length > 0);
}

/** Whether a card earns the heavy-model warning: four figures of nodes. */
export function isHeavyExample(ex: ProExample): boolean {
  return ex.stats.nodes >= 1000;
}
