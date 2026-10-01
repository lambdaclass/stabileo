/**
 * The specifications a model holds, grouped by value: the list Specifications › List shows.
 *
 * Nothing is stored here. Each member, support and shell carries its own fields; this reads them
 * and puts together the entities whose value is the same, one row per distinct value of each
 * specification, so a reader sees at once which members are cables, which ends are released,
 * which supports lift.
 */
import type { Element, StructureModel } from '../store/model.svelte';

export interface SpecRow {
  kind: 'member' | 'support' | 'shell';
  key: string;
  /** Which specification. */
  what: string;
  /** Its value, as a reader would say it. */
  value: string;
  ids: number[];
  /** For shells: the selection keys (`p3`, `q12`), in the order of `ids`. */
  shellKeys?: string[];
}

type T = (k: string) => string;

/**
 * What one member is told beyond its geometry, section and material: one entry per
 * specification that is not the default. The list below groups these; the Members table says
 * them per member.
 */
export function memberSpecifications(e: Element, t: T): Array<{ what: string; value: string }> {
  const out: Array<{ what: string; value: string }> = [];
  const spec = (what: string, value: string) => { out.push({ what, value }); };
  if (e.behaviour) spec(t('spec.members.axial'), t(e.behaviour === 'cable' ? 'spec.axial.cable' : `behaviour.${e.behaviour}`));
  else if (e.type === 'truss') spec(t('spec.members.axial'), t('spec.axial.truss'));
  for (const [end, r] of [['I', e.releaseI], ['J', e.releaseJ]] as const) {
    const free = r ? (['my', 'mz', 't'] as const).filter((k) => r[k]).map((k) => (k === 't' ? 'T' : k === 'my' ? 'My' : 'Mz')) : [];
    if (free.length) spec(`${t('spec.members.releases')} ${end}`, free.join(' · '));
  }
  if (e.jointI?.dof.some(Boolean) || e.jointJ?.dof.some(Boolean)) spec(t('behaviour.releases'), t('spec.list.joints'));
  if (e.semiRigid) spec(t('behaviour.semiRigid'), Object.keys(e.semiRigid).map((k) => k.toUpperCase()).join(' · '));
  if (e.stiffness) spec(t('behaviour.stiffness'), e.stiffness.preset ? t(`behaviour.preset.${e.stiffness.preset}`).replace('{f}', '').trim() : `A ${e.stiffness.a ?? 1} · Iy ${e.stiffness.iy ?? 1} · Iz ${e.stiffness.iz ?? 1} · J ${e.stiffness.j ?? 1}`);
  if (e.offset) spec(t('spec.members.offsets'), t(e.offset.frame === 'local' ? 'pro.offsetLocal' : 'pro.offsetGlobal'));
  if (e.rollAngle) spec(t('spec.members.localAxes'), `β ${e.rollAngle}°`);
  if (e.unbracedLength !== undefined || e.kStrong !== undefined || e.kWeak !== undefined) {
    spec(t('spec.members.designLengths'), [e.unbracedLength !== undefined ? `Lb ${e.unbracedLength} m` : '', e.kStrong !== undefined ? `K ${e.kStrong}` : '', e.kWeak !== undefined ? `K' ${e.kWeak}` : ''].filter(Boolean).join(' · '));
  }
  return out;
}

/** What one shell is told beyond its nodes, material and thickness: its curvature and offset. */
export function shellSpecifications(
  sh: { curved?: boolean; offset?: { frame: 'global' | 'local'; x: number; y: number; z: number } }, t: T,
): Array<{ what: string; value: string }> {
  const out: Array<{ what: string; value: string }> = [];
  if (sh.curved) out.push({ what: t('pro.shellCurvature'), value: t('pro.curvedShell') });
  const off = sh.offset;
  if (off) out.push({ what: t('pro.shellOffset'), value: `${off.frame === 'local' ? 'x, y, n' : 'X, Y, Z'} = ${[off.x, off.y, off.z].map((v) => +v.toFixed(4)).join(', ')} m` });
  return out;
}

export function specificationRows(m: StructureModel, t: T): SpecRow[] {
  const rows = new Map<string, SpecRow>();
  const add = (kind: SpecRow['kind'], what: string, value: string, id: number, shellKey?: string) => {
    const key = `${kind}|${what}|${value}`;
    const r = rows.get(key) ?? { kind, key, what, value, ids: [], ...(kind === 'shell' ? { shellKeys: [] } : {}) };
    r.ids.push(id);
    if (shellKey) r.shellKeys!.push(shellKey);
    rows.set(key, r);
  };

  for (const e of m.elements.values()) {
    for (const x of memberSpecifications(e, t)) add('member', x.what, x.value, e.id);
  }

  for (const s of m.supports.values()) {
    if (s.uplift) add('support', t('support.uplift'), t('spec.list.lifts'), s.id);
    if (s.isInclined) add('support', t('spec.list.inclined'), '', s.id);
    const springs = (['kx', 'ky', 'kz', 'krx', 'kry', 'krz'] as const).filter((k) => (s[k] ?? 0) > 0);
    if (springs.length) add('support', t('spec.list.springs'), springs.join(' · '), s.id);
    const curves = (s as { curves?: Record<string, unknown> }).curves;
    if (curves) add('support', t('spec.list.curves'), Object.keys(curves).filter((k) => curves[k]).join(' · '), s.id);
  }

  const shells: Array<[string, { id: number; curved?: boolean; offset?: { frame: 'global' | 'local'; x: number; y: number; z: number } }]> = [
    ...[...m.quads.values()].map((q) => ['q', q] as [string, typeof q]),
    ...[...m.plates.values()].map((p) => ['p', p] as [string, typeof p]),
  ];
  for (const [k, sh] of shells) {
    for (const x of shellSpecifications(sh, t)) add('shell', x.what, x.value, sh.id, `${k}${sh.id}`);
  }
  return [...rows.values()];
}
