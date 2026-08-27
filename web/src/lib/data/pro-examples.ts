/**
 * The PRO example catalogue.
 *
 * ── Why this is data and not markup ────────────────────────────────
 *
 * Seventeen curated engineering cases, each with a name, a stated intent, a size and a loader,
 * lived as a 190-line array literal inside `ProPanel.svelte` — a component that also owned the
 * tab router, the pre-solve gate and the whole report assembly. Adding an example meant editing
 * the panel; the panel could not be read without scrolling past the catalogue.
 *
 * Nothing here renders. `load()` is the only behaviour, and it is one call into `modelStore`,
 * so this module can be asserted against without a browser: that every group in the display
 * order has members, that no two entries load the same fixture, that every i18n key a card
 * prints exists.
 *
 * ── The stats are declared, not measured ───────────────────────────
 *
 * `stats` are the sizes written beside each card so a user can tell a 26-member frame from a
 * 5 013-member tower BEFORE waiting for it to load. They are authored figures: reading them
 * from the fixture would mean parsing seventeen JSON files to draw a menu. They are strings for
 * the same reason they are approximate — they are a label, and `pro.stats.heavy` is the only
 * decision taken from them.
 */

import { modelStore } from '../store/model.svelte';

export type ExampleGroup =
  | 'buildings' | 'industrial' | 'foundations' | 'longspan' | 'energy' | 'xl';

/**
 * Which display preferences an example wants on arrival.
 *
 * Carried per example and currently not branched on — `applyExamplePreset` turns the three
 * label overlays off for all of them, because a 5 000-member model with element labels on is
 * unreadable and a 26-member one does not need them either. It stays on the type because the
 * distinction is real (a bridge and a clean shell want different defaults) and the field is
 * what a future branch would read; the panel says so where it applies them.
 */
export type ExamplePreset = 'default' | 'xl' | 'clean-shell' | 'bridge';

export interface ProExample {
  nameKey: string;
  descKey: string;
  purposeKey: string;
  groupKey: string;
  group: ExampleGroup;
  tags: string[];
  stats: { nodes: string; members: string; shells?: string };
  preset?: ExamplePreset;
  featured?: boolean;
  load: () => void;
}

/** One heading with its cards, ready to render. */
export interface ProExampleGroup {
  group: ExampleGroup;
  title: string;
  examples: ProExample[];
}

/** The order the groups are shown in: what most projects are, down to what stresses the app. */
export const PRO_EXAMPLE_GROUP_ORDER: readonly ExampleGroup[] =
  ['buildings', 'industrial', 'energy', 'foundations', 'longspan', 'xl'] as const;

export const PRO_EXAMPLES: readonly ProExample[] = [
  {
    group: 'buildings',
    groupKey: 'pro.examples.groupBuildings',
    nameKey: 'ex.pro-edificio-7p',
    descKey: 'ex.pro-edificio-7p.desc',
    purposeKey: 'ex.pro-edificio-7p.purpose',
    tags: ['pro.tagRC', 'pro.tagCodes'],
    stats: { nodes: '141', members: '203', shells: '120' },
    preset: 'clean-shell',
    load: () => modelStore.loadExample('pro-edificio-7p'),
  },
  {
    group: 'buildings',
    groupKey: 'pro.examples.groupBuildings',
    nameKey: 'ex.irregularSetbackTower3D',
    descKey: 'ex.irregularSetbackTower3D.desc',
    purposeKey: 'ex.irregularSetbackTower3D.purpose',
    tags: ['pro.tagDrift', 'pro.tagTorsion'],
    stats: { nodes: '420', members: '1180' },
    preset: 'default',
    load: () => modelStore.loadExample('torre-irregular-con-retiros'),
  },
  {
    group: 'buildings',
    groupKey: 'pro.examples.groupBuildings',
    nameKey: 'ex.rcDesignFrame3D',
    descKey: 'ex.rcDesignFrame3D.desc',
    purposeKey: 'ex.rcDesignFrame3D.purpose',
    tags: ['pro.tagDesign', 'pro.tagRC'],
    stats: { nodes: '180', members: '344' },
    preset: 'default',
    load: () => modelStore.loadExample('rc-design-frame'),
  },
  {
    group: 'buildings',
    groupKey: 'pro.examples.groupBuildings',
    nameKey: 'ex.rc-qa-diagnostic',
    descKey: 'ex.rc-qa-diagnostic.desc',
    purposeKey: 'ex.rc-qa-diagnostic.purpose',
    tags: ['pro.tagDesign', 'pro.tagRC'],
    stats: { nodes: '18', members: '26' },
    preset: 'default',
    load: () => modelStore.loadExample('rc-qa-diagnostic'),
  },
  {
    group: 'buildings',
    groupKey: 'pro.examples.groupBuildings',
    nameKey: 'ex.cad-arch-structure-dxf',
    descKey: 'ex.cad-arch-structure-dxf.desc',
    purposeKey: 'ex.cad-arch-structure-dxf.purpose',
    tags: ['pro.tagRC', 'pro.tagCad'],
    stats: { nodes: '2101', members: '970', shells: '1160' },
    preset: 'default',
    load: () => modelStore.loadExample('cad-arch-structure-dxf'),
  },
  {
    group: 'buildings',
    groupKey: 'pro.examples.groupBuildings',
    nameKey: 'ex.cad-arch-only-dxf',
    descKey: 'ex.cad-arch-only-dxf.desc',
    purposeKey: 'ex.cad-arch-only-dxf.purpose',
    tags: ['pro.tagRC', 'pro.tagCad'],
    stats: { nodes: '794', members: '1000', shells: '660' },
    preset: 'default',
    load: () => modelStore.loadExample('cad-arch-only-dxf'),
  },
  {
    group: 'industrial',
    groupKey: 'pro.examples.groupIndustrial',
    nameKey: 'ex.3d-nave-industrial',
    descKey: 'ex.3d-nave-industrial.desc',
    purposeKey: 'ex.3d-nave-industrial.purpose',
    tags: ['pro.tagSteel', 'pro.tagCrane'],
    stats: { nodes: '232', members: '633' },
    preset: 'default',
    load: () => modelStore.loadExample('3d-nave-industrial'),
  },
  {
    group: 'industrial',
    groupKey: 'pro.examples.groupIndustrial',
    nameKey: 'ex.pipeRack3D',
    descKey: 'ex.pipeRack3D.desc',
    purposeKey: 'ex.pipeRack3D.purpose',
    tags: ['pro.tagIndustrial', 'pro.tagSteel'],
    stats: { nodes: '90', members: '173' },
    preset: 'default',
    load: () => modelStore.loadExample('pipe-rack'),
  },
  {
    group: 'energy',
    groupKey: 'pro.examples.groupEnergy',
    nameKey: 'ex.offshorePlatform',
    descKey: 'ex.offshorePlatform.desc',
    purposeKey: 'ex.offshorePlatform.purpose',
    tags: ['pro.tagSteel', 'pro.tagOffshore'],
    stats: { nodes: '196', members: '762' },
    preset: 'default',
    featured: true,
    load: () => modelStore.loadExample('offshore-platform'),
  },
  {
    group: 'foundations',
    groupKey: 'pro.examples.groupFoundations',
    nameKey: 'ex.matFoundation3D',
    descKey: 'ex.matFoundation3D.desc',
    purposeKey: 'ex.matFoundation3D.purpose',
    tags: ['pro.tagFoundation', 'pro.tagSoil'],
    stats: { nodes: '99', members: '180', shells: '80' },
    preset: 'clean-shell',
    load: () => modelStore.loadExample('mat-foundation'),
  },
  {
    group: 'longspan',
    groupKey: 'pro.examples.groupLongSpan',
    nameKey: 'ex.suspensionBridge3D',
    descKey: 'ex.suspensionBridge3D.desc',
    purposeKey: 'ex.suspensionBridge3D.purpose',
    tags: ['pro.tagCables', 'pro.tagLongSpan'],
    stats: { nodes: '378', members: '932' },
    preset: 'bridge',
    load: () => modelStore.loadExample('suspension-bridge'),
  },
  {
    group: 'longspan',
    groupKey: 'pro.examples.groupLongSpan',
    nameKey: 'ex.cableStayedBridge3D',
    descKey: 'ex.cableStayedBridge3D.desc',
    purposeKey: 'ex.cableStayedBridge3D.purpose',
    tags: ['pro.tagCables', 'pro.tagBridge'],
    stats: { nodes: '74', members: '125' },
    preset: 'bridge',
    load: () => modelStore.loadExample('cable-stayed-bridge'),
  },
  {
    group: 'longspan',
    groupKey: 'pro.examples.groupLongSpan',
    nameKey: 'ex.fullStadium3D',
    descKey: 'ex.fullStadium3D.desc',
    purposeKey: 'ex.fullStadium3D.purpose',
    tags: ['pro.tagRoof', 'pro.tagBowl'],
    stats: { nodes: '360', members: '876', shells: '48' },
    preset: 'clean-shell',
    load: () => modelStore.loadExample('full-stadium'),
  },
  {
    group: 'xl',
    groupKey: 'pro.examples.groupXL',
    nameKey: 'ex.geodesicDome3D',
    descKey: 'ex.geodesicDome3D.desc',
    purposeKey: 'ex.geodesicDome3D.purpose',
    tags: ['pro.tagShells', 'pro.tagScale'],
    stats: { nodes: '641', members: '1920' },
    preset: 'xl',
    load: () => modelStore.loadExample('geodesic-dome'),
  },
  {
    group: 'xl',
    groupKey: 'pro.examples.groupXL',
    nameKey: 'ex.laBombonera3D',
    descKey: 'ex.laBombonera3D.desc',
    purposeKey: 'ex.laBombonera3D.purpose',
    tags: ['pro.tagBowl', 'pro.tagScale'],
    stats: { nodes: '1005', members: '2476', shells: '120' },
    preset: 'clean-shell',
    featured: true,
    load: () => modelStore.loadExample('la-bombonera'),
  },
  {
    group: 'xl',
    groupKey: 'pro.examples.groupXL',
    nameKey: 'ex.xlDiagridTower3D',
    descKey: 'ex.xlDiagridTower3D.desc',
    purposeKey: 'ex.xlDiagridTower3D.purpose',
    tags: ['pro.tagScale', 'pro.tagDrift'],
    stats: { nodes: '1262', members: '5013' },
    preset: 'xl',
    load: () => modelStore.loadExample('xl-diagrid-tower'),
  },
  // Sagrada Familia removed upstream — fixture no longer available
];

/**
 * The catalogue grouped for display, in `PRO_EXAMPLE_GROUP_ORDER`.
 *
 * A group with no examples is dropped rather than rendered empty: the order above is the
 * intended shape of the menu, not a promise that every category is populated in every build.
 * The heading comes from the first member's own `groupKey`, so a group and its cards can never
 * disagree about what the group is called.
 */
export function proExampleGroups(translate: (key: string) => string): ProExampleGroup[] {
  return PRO_EXAMPLE_GROUP_ORDER.map((group) => ({
    group,
    title: translate(PRO_EXAMPLES.find((ex) => ex.group === group)?.groupKey ?? ''),
    examples: PRO_EXAMPLES.filter((ex) => ex.group === group),
  })).filter((g) => g.examples.length > 0);
}

/** Whether a card earns the `pro.stats.heavy` warning: four figures of nodes. */
export function isHeavyExample(ex: ProExample): boolean {
  return Number(ex.stats.nodes) >= 1000;
}
