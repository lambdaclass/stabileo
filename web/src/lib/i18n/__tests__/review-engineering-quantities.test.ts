import { expect, it } from 'vitest';
import { generateLatticeColumn } from '../../engine/generators/lattice-column';
import { DEFAULT_TRUSS_PARAMS, validateTrussParams } from '../../engine/generators/truss-topology';
import { allDictFor } from '../locales/all';

it.each([
  ["it", "course.dynamics.sdof.damp.wdLabel", "Pulsazione smorzata"],
  ["it", "course.dynamics.sdof.damp.noOscillation", "pulsazione smorzata"],
  ["it", "course.dynamics.sdof.free.why", "pulsazione ω_D"],
  ["it", "course.dynamics.ui.points.help", "massa concentrata in tonnellate"],
  ["it", "course.kinematics.req.noUnknowns", "diverse da zero e si recuperano"],
  ["nl", "course.dynamics.mass.guyan.exactness", "bij de laagste eigenvormen"],
  ["nl", "course.plastic.mech.axialNote", "Np·|Δ|"],
  ["nl", "course.second-order.refuse.rigidIndeterminate", "tegen axiale verplaatsing"],
  ["nl", "course.second-order.doc.intro.so-buckling-phi", "met hun multipliciteit"],
  ["nl", "course.second-order.doc.bk.det.what", "met hun multipliciteit"],
  ["nl", "steps.m.so-buckling-phi.help", "met hun multipliciteit"],
  ["nl", "steps.m.so-pdelta-kg.help", "dezelfde eindige axiale stijfheid"],
  ["nl", "course.second-order.doc.compare.why.phi", "rekenkern"],
  ["nl", "course.second-order.doc.compare.why.consistent", "rekenkern"],
  ["nl", "course.second-order.doc.compare.why.string", "rekenkern"],
  ["nl", "course.second-order.doc.compare.rigid", "rekenkern"],
  ["nl", "course.second-order.doc.bk.compare.phi", "rekenkern"],
  ["nl", "course.second-order.doc.bk.compare.consistent", "rekenkern"],
  ["nl", "course.second-order.doc.bk.compare.string", "rekenkern"],
  ["nl", "course.second-order.doc.bk.compare.n", "rekenkern"],
  ["nl", "course.second-order.doc.bk.compare.convCaption", "rekenkern"],
  ["nl", "steps.m.so-pdelta-kg.help", "rekenkern"],
  ["nl", "course.statics.gh.verdict.hypo", "is de constructie een mechanisme"],
  ["it", "course.statics.fm.fund.how", "Ogni componente svincolata"],
  ["it", "advanced.despiece", "Vista a corpo libero"],
  ["it", "ctxHelp.influenceLine.step1", "(Rz, Rx, My)"],
  ["it", "float.rollerGlobalLabel", "Z verticale"],
  ["it", "tooltip.supFixed.desc", "ux e uz; con Y verticale lo spostamento verticale è uy"],
  ["it", "tooltip.supPinned.desc", "ux e uz"],
  ["it", "tooltip.supRollerX.desc", "verticale (uz con Z verticale, uy con Y verticale)"],
  ["it", "tooltip.supRollerY.desc", "verticale libere (uz con Z verticale, uy con Y verticale)"],
  ["it", "autoLoad.seismicZ", "Sisma Y"],
  ["it", "stress.ccCHSNote", "(R² + r²)/(4R)"],
  ["it", "diag.tooltip.SANITY_SECTION_IMPLAUSIBLE", "Iy ≈ 8,36e-5 m⁴ e Iz ≈ 6,04e-6 m⁴"],
  ["it", "pro.driftTitle", "§6.4, Tabella 6.4"],
  ["it", "report.driftTitle", "§6.4, Tabella 6.4"],
  ["nl", "loads.cirsoc102.roofSlope", "Dakhelling"],
  ["nl", "autoLoad.windRoofSlope", "Dakhelling"],
  ["it", "steel.assume.webAndFlangeThicknessInferred", "spessori dichiarati"],
  ["it", "steel.assume.ultimateStrengthInferred", "resistenza ultima Fu dichiarata"],
  ["it", "steel.workflow.limit.flexuralCap", "Si applica il limite Mp ≤ 1,5·My (F.2.1"],
  ["it", "steel.tc.staggerG", "interasse trasversale"],
  ["nl", "generator.problem.plateauExceedsSpan", "korter zijn dan"],
  ["it", "steps.trusses.compat.endsLeadFrame", "l’opposto della somma delle forze esercitate dalle aste sul nodo"],
  ["it", "steps.common.units", "spostamenti in m e rotazioni"],
  ["nl", "steps.common.units", "verplaatsingen in m en rotaties"],
  ["it", "steps.m.crossBeams.dfWhy", "CR = k/Σk"],
  ["it", "steps.m.crossBeams.finalWhy", "righe «Ripartizione» e «Trasmissione»"],
  ["it", "steps.deformation.req.constraints", "vincoli interni o connettori"],
] as const)('known wrong result: #2613 — %s %s states %s', (locale, key, expected) => {
  expect(allDictFor(locale)[key]).toContain(expected);
});

it.each([9, 10, 11])('Dutch plateau guidance follows the span boundary at %i', plateauM => {
  const problems = validateTrussParams({ ...DEFAULT_TRUSS_PARAMS, kind: 'trapezoidal', spanM: 10, plateauM });
  const problem = problems.find(p => p.key === 'generator.problem.plateauExceedsSpan');
  if (plateauM < 10) expect(problem).toBeUndefined();
  else expect(allDictFor('nl')[problem!.key]).toContain('korter zijn dan');
});

it.each([
  ['zigzag', 'Zigzagvulling, om en om van vak tot vak.'],
  ['parallel', 'Vulling waarbij elke diagonaal dezelfde kant op helt.'],
] as const)('the generated %s lacing identifies its arrangement in Dutch', (lacing, description) => {
  const labels = generateLatticeColumn({ lacing }).assumptions.map(key => allDictFor('nl')[key]);
  expect(labels).toContain(description);
});
