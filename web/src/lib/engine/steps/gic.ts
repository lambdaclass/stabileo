/**
 * The degree of kinematic indeterminacy, GIC = n_θ + n_Δ, written out the way
 * a course counts it: which joints rotate and why the others do not, how many
 * translations are independent and where the number comes from, the sketch
 * of the unknowns and how it compares with the static degree GH. The
 * displacement method, slope-deflection, moment distribution and the
 * stiffness wizard all show it from here.
 */
import type { Block, Cell } from './doc';
import { tx } from './doc';
import type { Sketch } from './sketch';
import { sketchOf } from './sketch';
import type { KinSet } from './kinematic-unknowns';
import { unknownSym } from './kinematic-unknowns';

const P = 'course.kinematics.gic.';

const names = (ks: KinSet, ns: number[]) => ns.map((n) => ks.pm.nodes.get(n)!.name).join(', ');

/** The released ends, named by member and joint: "CD en C". */
function releasedEnds(ks: KinSet): Array<{ m: string; n: string; hinge: boolean }> {
  const out: Array<{ m: string; n: string; hinge: boolean }> = [];
  for (const e of ks.ends.values()) {
    const m = ks.pm.members.get(e.member)!;
    if (m.truss) continue;
    if (e.role === 'released' || (e.role === 'joint' && ks.unknowns[e.unknown]?.kind === 'rot' && (ks.unknowns[e.unknown] as { hinge: boolean }).hinge)) {
      out.push({ m: m.name, n: ks.pm.nodes.get(e.node)!.name, hinge: e.hinge });
    }
  }
  return out;
}

/** The structure with every kinematic unknown drawn: arcs for rotations, arrows for translations. */
export function gicSketch(ks: KinSet): Sketch {
  const sk = sketchOf(ks.pm);
  sk.dofs = [];
  ks.unknowns.forEach((u, k) => {
    const label = unknownSym(ks, k).plain;
    if (u.kind === 'rot') sk.dofs!.push({ node: u.node, kind: 'ry', label, color: 'dof' });
    else {
      const p = u.phi.get(u.lead)!;
      sk.dofs!.push({ node: u.lead, kind: u.dir === 'z' || (!u.dir && Math.abs(p.z) > Math.abs(p.x)) ? 'uz' : 'ux', label, color: 'accent' });
    }
  });
  return sk;
}

/** n_Δ with its count: 2n − r_t with axial stiffness, 2n − r_t − b (or 2n − c with redundant conditions) without. */
function deltaCalc(ks: KinSet): Block {
  const { n, rt, b, rank } = ks.count;
  if (ks.opts.axial) {
    return { kind: 'calc', label: tx(`${P}deltaAxial`), formula: 'n_{\\Delta} = 2n - r_t', subst: `n_{\\Delta} = 2 \\cdot ${n} - ${rt}`, result: `\\boxed{n_{\\Delta} = ${ks.nDelta}}` };
  }
  if (rank === rt + b) {
    return { kind: 'calc', label: tx(`${P}deltaRigid`), formula: 'n_{\\Delta} = 2n - r_t - b', subst: `n_{\\Delta} = 2 \\cdot ${n} - ${rt} - ${b}`, result: `\\boxed{n_{\\Delta} = ${ks.nDelta}}` };
  }
  return { kind: 'calc', label: tx(`${P}deltaRigid`), formula: 'n_{\\Delta} = 2n - c', subst: `n_{\\Delta} = 2 \\cdot ${n} - ${rank}`, result: `\\boxed{n_{\\Delta} = ${ks.nDelta}}` };
}

/** GH against GIC: which method has fewer unknowns for this structure. */
export function ghVsGicBlocks(gh: number, gic: number): Block[] {
  const which = gh < gic ? 'force' : gic < gh ? 'disp' : 'equal';
  return [
    { kind: 'table', head: [tx(`${P}cmpMethod`), tx(`${P}cmpUnknowns`), tx(`${P}cmpCount`)], rows: [
      [tx(`${P}cmpForce`), tx(`${P}cmpForceWhat`), { tex: `GH = ${gh}` }],
      [tx(`${P}cmpDisp`), tx(`${P}cmpDispWhat`), { tex: `GIC = ${gic}` }],
    ] as Cell[][], caption: tx(`${P}cmpCaption`) },
    { kind: 'note', tone: 'info', text: tx(`${P}cmp.${which}`, { gh, gic }) },
  ];
}

/** The whole count: rotations, translations, GIC, the sketch and (with gh) the comparison with the force method. */
export function gicBlocks(ks: KinSet, gh: number | null): Block[] {
  const b: Block[] = [{ kind: 'p', text: tx(`${P}what`) }];
  const rot: Block[] = [];
  const free = ks.unknowns.flatMap((u) => (u.kind === 'rot' && !u.hinge ? [u.node] : []));
  rot.push({ kind: 'p', text: free.length ? tx(`${P}rotFree`, { nodes: names(ks, free) }) : tx(`${P}rotNone`) });
  if (ks.heldNodes.length) rot.push({ kind: 'p', text: tx(`${P}rotHeld`, { nodes: names(ks, ks.heldNodes) }) });
  if (ks.pinJoints.length) rot.push({ kind: 'p', text: tx(`${P}rotPin`, { nodes: names(ks, ks.pinJoints) }) });
  const rel = releasedEnds(ks);
  if (rel.length) {
    const list = rel.map((r) => `${r.m} (${r.n})`).join(', ');
    rot.push({ kind: 'p', text: tx(ks.opts.releasedUnknown ? `${P}rotReleasedCounted` : `${P}rotReleased`, { ends: list }) });
  }
  if (ks.springs.some((s) => s.dir === 'r')) rot.push({ kind: 'p', text: tx(`${P}rotSpring`), detail: true });
  const syms = ks.unknowns.slice(0, ks.nTheta).map((_, k) => unknownSym(ks, k).tex);
  rot.push({ kind: 'calc', label: tx(`${P}thetaCount`), formula: 'n_{\\theta}', subst: syms.length ? syms.join(',\\ ') : undefined, result: `\\boxed{n_{\\theta} = ${ks.nTheta}}` });
  b.push({ kind: 'sub', title: tx(`${P}rotTitle`), blocks: rot });

  const tr: Block[] = [{ kind: 'p', text: tx(ks.opts.axial ? `${P}transAxial` : `${P}transRigid`) }];
  const { n, rt, b: nb, rank } = ks.count;
  tr.push({ kind: 'p', text: tx(ks.opts.axial ? `${P}transCountAxial` : `${P}transCountRigid`, { n, rt, b: nb, c: rank }), detail: true });
  if (!ks.opts.axial && rank < rt + nb) tr.push({ kind: 'p', text: tx(`${P}transRedundant`, { s: rt + nb, c: rank }) });
  if (ks.springs.some((s) => s.dir !== 'r')) tr.push({ kind: 'p', text: tx(`${P}transSpring`), detail: true });
  if (ks.extensible.size && !ks.opts.axial) tr.push({ kind: 'p', text: tx(`${P}transBiela`), detail: true });
  tr.push(deltaCalc(ks));
  b.push({ kind: 'sub', title: tx(`${P}transTitle`), blocks: tr });

  b.push({ kind: 'calc', label: tx(`${P}total`), formula: 'GIC = n_{\\theta} + n_{\\Delta}', subst: `GIC = ${ks.nTheta} + ${ks.nDelta}`, result: `\\boxed{GIC = ${ks.unknowns.length}}` });
  b.push({ kind: 'fig', sketch: gicSketch(ks), caption: tx(`${P}figCaption`) });
  b.push({ kind: 'p', text: tx(ks.opts.axial ? `${P}switchToRigid` : `${P}switchToAxial`), detail: true });
  if (gh !== null) b.push(...ghVsGicBlocks(gh, ks.unknowns.length));
  return b;
}

/** A short line for documents that count their unknowns their own way (slope-deflection, moment distribution). */
export function gicSummaryBlocks(nTheta: number, nDelta: number, gh: number | null): Block[] {
  const out: Block[] = [
    { kind: 'calc', label: tx(`${P}total`), formula: 'GIC = n_{\\theta} + n_{\\Delta}', subst: `GIC = ${nTheta} + ${nDelta}`, result: `\\boxed{GIC = ${nTheta + nDelta}}` },
    { kind: 'p', text: tx(`${P}summaryWhy`), detail: true },
  ];
  if (gh !== null) out.push(...ghVsGicBlocks(gh, nTheta + nDelta));
  return out;
}
