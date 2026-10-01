/**
 * The specifications a model holds, grouped by value: the list Specifications › List shows.
 *
 * Nothing is stored here. Each member, support and shell carries its own fields; this reads them
 * and puts together the entities whose value is the same, one row per distinct value of each
 * specification, so a reader sees at once which members are cables, which ends are released,
 * which supports lift.
 */
import type { StructureModel } from '../store/model.svelte';

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
    if (e.behaviour) add('member', t('spec.members.axial'), t(e.behaviour === 'cable' ? 'spec.axial.cable' : `behaviour.${e.behaviour}`), e.id);
    else if (e.type === 'truss') add('member', t('spec.members.axial'), t('spec.axial.truss'), e.id);
    for (const [end, r] of [['I', e.releaseI], ['J', e.releaseJ]] as const) {
      const free = r ? (['my', 'mz', 't'] as const).filter((k) => r[k]).map((k) => (k === 't' ? 'T' : k === 'my' ? 'My' : 'Mz')) : [];
      if (free.length) add('member', `${t('spec.members.releases')} ${end}`, free.join(' · '), e.id);
    }
    if (e.jointI?.dof.some(Boolean) || e.jointJ?.dof.some(Boolean)) add('member', t('behaviour.releases'), t('spec.list.joints'), e.id);
    if (e.semiRigid) add('member', t('behaviour.semiRigid'), Object.keys(e.semiRigid).map((k) => k.toUpperCase()).join(' · '), e.id);
    if (e.stiffness) add('member', t('behaviour.stiffness'), e.stiffness.preset ? t(`behaviour.preset.${e.stiffness.preset}`).replace('{f}', '').trim() : `A ${e.stiffness.a ?? 1} · Iy ${e.stiffness.iy ?? 1} · Iz ${e.stiffness.iz ?? 1} · J ${e.stiffness.j ?? 1}`, e.id);
    if (e.offset) add('member', t('spec.members.offsets'), t(e.offset.frame === 'local' ? 'pro.offsetLocal' : 'pro.offsetGlobal'), e.id);
    if (e.rollAngle) add('member', t('spec.members.localAxes'), `β ${e.rollAngle}°`, e.id);
    if (e.unbracedLength !== undefined || e.kStrong !== undefined || e.kWeak !== undefined) {
      add('member', t('spec.members.designLengths'), [e.unbracedLength !== undefined ? `Lb ${e.unbracedLength} m` : '', e.kStrong !== undefined ? `K ${e.kStrong}` : '', e.kWeak !== undefined ? `K' ${e.kWeak}` : ''].filter(Boolean).join(' · '), e.id);
    }
  }

  for (const s of m.supports.values()) {
    if (s.uplift) add('support', t('support.uplift'), t('spec.list.lifts'), s.id);
    if (s.isInclined) add('support', t('spec.list.inclined'), '', s.id);
    const springs = (['kx', 'ky', 'kz', 'krx', 'kry', 'krz'] as const).filter((k) => (s[k] ?? 0) > 0);
    if (springs.length) add('support', t('spec.list.springs'), springs.join(' · '), s.id);
  }

  const shells: Array<[string, { id: number; curved?: boolean; offset?: unknown }]> = [
    ...[...m.quads.values()].map((q) => ['q', q] as [string, typeof q]),
    ...[...m.plates.values()].map((p) => ['p', p] as [string, typeof p]),
  ];
  for (const [k, sh] of shells) {
    const key = `${k}${sh.id}`;
    if ((sh as { curved?: boolean }).curved) add('shell', t('pro.shellCurvature'), t('pro.curvedShell'), sh.id, key);
    if ((sh as { offset?: unknown }).offset) add('shell', t('pro.shellOffset'), '', sh.id, key);
  }
  return [...rows.values()];
}
