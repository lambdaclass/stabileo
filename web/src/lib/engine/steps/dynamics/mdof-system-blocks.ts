/**
 * The first three steps of the modal decomposition document: the degrees of
 * freedom and the masses, K and M, for the bar model (with the condensation
 * of the degrees of freedom without mass) or for the shear building.
 */
import type { Block, Step } from '../doc';
import { numText } from '../format';
import type { MemberMass } from '../../dynamics/course/mdof-system';
import type { MdofCase } from './mdof-build';
import { p, note, t, matrixBlock, dofTextN } from './common';

const MAX_ROWS = 12;

export function mdofSystemBlocks(c: MdofCase, names: Map<number, string>, labels: string[]): Step[] {
  const sys = c.sys!;
  const full = sys.fullDofs.map((d) => dofTextN(d, names));
  const cond = sys.condensation;
  const mm = sys.massModel;
  const pieceName = (m: MemberMass) => {
    const chain = sys.chains.get(m.memberId) ?? [];
    const base = `${names.get(chain[0])}–${names.get(chain[chain.length - 1])}`;
    const pieces = sys.members.filter((x) => x.memberId === m.memberId).map((x) => x.elementId);
    return chain.length > 2 ? `${base} (${pieces.indexOf(m.elementId) + 1}/${chain.length - 1})` : base;
  };
  const barMass = sys.members.reduce((s, m) => s + m.rhoA * m.L, 0);
  const s1: Block[] = [
    p('mdof.dof.lead', { n: sys.fullDofs.length, kept: sys.dofs.length }),
    p(`mdof.mass.${mm}`),
    p(`mdof.mass.${mm}.why`, undefined, true),
  ];
  if (sys.members.length && sys.members.length <= MAX_ROWS) {
    s1.push({ kind: 'table', head: [t('mdof.mass.piece'), { tex: '\\rho A\\ [\\text{t/m}]' }, { tex: 'L\\ [\\text{m}]' }, { tex: '\\rho A L\\ [\\text{t}]' }, t('mdof.mass.how')],
      rows: sys.members.map((m) => [pieceName(m), m.rhoA, m.L, m.rhoA * m.L, t(`mdof.mass.kind.${m.kind}`)]), caption: t('mdof.mass.barsCaption', { m: numText(barMass) }) });
  } else if (sys.members.length) {
    s1.push(p('mdof.mass.barsTotal', { n: sys.members.length, m: numText(barMass) }));
  } else {
    s1.push(note('info', 'mdof.mass.noBars'));
  }
  if (sys.points.length) {
    s1.push({ kind: 'table', head: [t('mdof.mass.node'), { tex: 'm_x\\ [\\text{t}]' }, { tex: 'm_z\\ [\\text{t}]' }], rows: sys.points.map((q) => [names.get(q.nodeId) ?? String(q.nodeId), q.mx, q.mz]), caption: t('mdof.mass.pointsCaption') });
  }
  s1.push(p('mdof.mass.total', { m: numText(sys.totalMass) }));
  if (cond) {
    s1.push(p(mm === 'guyan' ? 'mdof.dof.keptGuyan' : 'mdof.dof.keptMassless', { kept: labels.join(', '), cond: cond.slaves.map((i) => full[i]).join(', ') }));
  }

  const s2: Block[] = [p('mdof.k.lead'), matrixBlock('\\mathbf K', sys.fullK, full)];
  if (cond) {
    const order = [...cond.masters, ...cond.slaves].map((i) => full[i]);
    s2.push(
      p('mdof.k.condLead'),
      { kind: 'eq', tex: '\\begin{bmatrix} \\mathbf K_{mm} & \\mathbf K_{ms} \\\\ \\mathbf K_{sm} & \\mathbf K_{ss} \\end{bmatrix} \\begin{Bmatrix} \\mathbf u_m \\\\ \\mathbf u_s \\end{Bmatrix} = \\begin{Bmatrix} \\mathbf F_m \\\\ \\mathbf 0 \\end{Bmatrix} \\;\\Rightarrow\\; \\mathbf u_s = -\\mathbf K_{ss}^{-1}\\mathbf K_{sm}\\,\\mathbf u_m' },
      p(mm === 'guyan' ? 'mdof.k.condWhyGuyan' : 'mdof.k.condWhy', undefined, true),
      { kind: 'eq', tex: '\\mathbf K^* = \\mathbf K_{mm} - \\mathbf K_{ms}\\,\\mathbf K_{ss}^{-1}\\,\\mathbf K_{sm}, \\qquad \\mathbf T = \\begin{bmatrix} \\mathbf I \\\\ -\\mathbf K_{ss}^{-1}\\mathbf K_{sm} \\end{bmatrix}' },
      matrixBlock('\\mathbf T', cond.T, order, t('mdof.k.tCaption'), labels),
      matrixBlock('\\mathbf K^*', sys.K, labels, t('mdof.k.kCaption')),
    );
  }

  const s3: Block[] = [p(`mdof.m.lead.${mm}`), matrixBlock('\\mathbf M', sys.fullM, full)];
  if (cond) {
    s3.push(
      { kind: 'eq', tex: '\\mathbf M^* = \\mathbf T^T\\,\\mathbf M\\,\\mathbf T, \\qquad \\mathbf F^* = \\mathbf T^T\\,\\mathbf F' },
      p(mm === 'guyan' ? 'mdof.m.condGuyan' : 'mdof.m.condExact', undefined, true),
      matrixBlock('\\mathbf M^*', sys.M, labels, t('mdof.m.mCaption')),
    );
  }
  s3.push(matrixBlock('\\mathbf F', sys.F.map((v) => [v]), labels, t('mdof.m.fCaption'), ['F']));
  return [{ title: t('mdof.s1'), blocks: s1 }, { title: t('mdof.s2'), blocks: s2 }, { title: t('mdof.s3'), blocks: s3 }];
}

export function shearBlocks(c: MdofCase, labels: string[]): Step[] {
  const sh = c.shear!;
  const s1: Block[] = [
    p('mdof.shear.lead', { n: sh.floors.length }),
    p('mdof.shear.assume'),
    p('mdof.shear.why', undefined, true),
    { kind: 'eq', tex: 'k_c = \\frac{12\\,EI}{h^3} \\;\\text{(1)}, \\qquad k_c = \\frac{3\\,EI}{h^3} \\;\\text{(2)}, \\qquad k_i = \\sum_{\\text{c}} k_c', note: t('mdof.shear.colNote') },
    { kind: 'table', head: [t('mdof.shear.floor'), { tex: 'h\\ [\\text{m}]' }, t('mdof.shear.columns'), { tex: 'k_i\\ [\\text{kN/m}]' }, { tex: 'm_i\\ [\\text{t}]' }, { tex: 'F_i\\ [\\text{kN}]' }],
      rows: sh.floors.map((f) => [f.level, f.h, f.columns.map((col) => `${col.factor}EI/h³ = ${numText(col.k)}`).join(' + '), f.k, f.m, f.F]), caption: t('mdof.shear.tableCaption') },
    p(c.settings.mdof.barMass ? 'mdof.shear.massWith' : 'mdof.shear.massWithout', undefined, true),
  ];
  const n = sh.floors.length;
  const s2: Block[] = [
    p('mdof.shear.kLead'),
    { kind: 'eq', tex: n === 1 ? 'K = k_1' : `\\mathbf K = \\begin{bmatrix} k_1 + k_2 & -k_2 & \\cdots \\\\ -k_2 & k_2 + k_3 & \\cdots \\\\ \\vdots & & k_{${n}} \\end{bmatrix}` },
    matrixBlock('\\mathbf K', c.K, labels),
  ];
  const s3: Block[] = [p('mdof.shear.mLead'), matrixBlock('\\mathbf M', c.M, labels), matrixBlock('\\mathbf F', c.F.map((v) => [v]), labels, t('mdof.m.fCaption'), ['F'])];
  return [{ title: t('mdof.s1shear'), blocks: s1 }, { title: t('mdof.s2'), blocks: s2 }, { title: t('mdof.s3'), blocks: s3 }];
}
