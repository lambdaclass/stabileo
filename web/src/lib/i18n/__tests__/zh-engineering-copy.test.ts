import { expect, it } from 'vitest';
import { STRINGS } from '../../../components/research/i18n';
import bars from '../../blog/translations/zh/bars-or-finite-elements';
import determinism from '../../blog/translations/zh/the-determinism-boundary';
import { changes } from '../../provenance/result-changes/numbered.json';
import dynamics from '../locales/course/dynamics/zh';
import influence from '../locales/course/influence/zh';
import plastic from '../locales/course/plastic/zh';
import steel from '../locales/steel/zh';
import steps from '../locales/steps/zh';
import zh from '../locales/zh';

const copyCases: [string, string | undefined, RegExp][] = [
  ['biaxial bending lever arms', zh['stress.sigmaBiaxHelp'], /Mz·y\/Iz − My·z\/Iy/],
  ['signed shear superposition', zh['stress.tauTotalHelp'], /\(τVy \+ τTy\)² \+ \(τVz \+ τTz\)²/],
  ['I/H kern shape label', zh['stress.coreHexagonal'], /^菱形$/],
  ['I/H kern outer fibers', zh['stress.ccIHNote'], /菱形.*I<sub>z<\/sub>\/\(A·h\/2\).*I<sub>y<\/sub>\/\(A·b\/2\)/],
  ['honeycomb half-distance', STRINGS.zh.springsCornerDistance, /相对角点间距的一半/],
  ['residual base touches the superscript', STRINGS.zh.residualThreshold, /小于 10$/],
  ['modal stiffness divided by mass', dynamics['course.dynamics.mdof.orth.tableCaption'], /ω_i² = K_i\/M_i/],
  ['Maxwell projection and downward sign', influence['course.influence.doc.maxwell.principle'], /投影.*向下.*−u_z/],
  ['signed plastic hinge', plastic['course.plastic.trace.hinge'], /±Mp.*屈服时.*符号/],
  ['signed axial yield', plastic['course.plastic.trace.yield'], /±Np.*屈服时.*符号/],
  ['absolute Cb moments and full-segment peak', steel['steel.cb.reason.computed'], /3·\|MA\| \+ 4·\|MB\| \+ 3·\|MC\|.*整个无支撑段.*最大绝对值/],
  ['E.4.3 torsion constant in numerator', steel['steel.e4.gap.torsionalConstant'], /分子.*G·J|G·J.*分子/],
  ['gross section yield conversion', steel['steel.tc.calc.yield'], /\{Fy\}·\{Ag\}.*10⁻³.*kN/],
  ['net section rupture conversion', steel['steel.tc.calc.rupture'], /\{Fu\}·\{Ae\}.*10⁻³.*kN/],
  ['worked gross section yield conversion', steel['c301.d.yield'], /\{Fy\}·\{Ag\}.*10⁻³.*kN/],
  ['worked net section rupture conversion', steel['c301.d.rupture'], /\{Fu\}·\{Ae\}.*10⁻³.*kN/],
  ['inelastic flexural cap', steel['c301.f.ltbInelastic'], /Mn = min\(Cb·\[.*\], Mp\) = \{Mn\}/],
  ['elastic flexural cap', steel['c301.f.ltbElastic'], /Mn = min\(Mcr, Mp\) = \{Mn\}/],
  ['weak-axis plastic cap', steel['c301.f.weakMp'], /Mp = min\(Fy·Zy, 1\.5·Fy·Sy\) = \{Mp\}/],
  ['fixed-end signed transverse equilibrium', steps['steps.fem.check'], /ΣRᵧ \+ ΣFᵧ = 0/],
  ['overhang signed load transfer', steps['steps.continuous.overhangShear'], /带符号的.*合力.*传递.*支座/],
  ['signed shell displacement', bars.blocks.flatMap(b => b.k === 'embed' && b.query === 'example=deep-beam-shell' ? [b.label] : []).join('\n'), /[−-]5\.19e[−-]5.*−0\.0519 mm/],
  ['beam midspan moment balance', determinism.blocks.map(b => b.k === 'p' ? b.t : '').join('\n'), /M_mid − \(M_L \+ M_R\)\/2 = qL²\/8 = 135 kN·m/],
  ['global static force equilibrium', determinism.blocks.flatMap(b => b.k === 'ul' ? b.items : []).join('\n'), /∑𝐑 \+ ∑𝐏 = 𝟎/],
];

it.each(copyCases)('known wrong result: #2360 — %s', (_name, copy, expected) => {
  expect(copy).toMatch(expected);
});

it('known wrong result: #2360 — separates the snow factor from the snow load', () => {
  const copy = changes.find(c => c.id === 'cirsoc-combinations-and-loads')?.explanation.zh;
  expect(copy).toMatch(/f2 = 0\.70[，；）。]/);
  expect(copy).toContain('f2·S = 0.70 S');
});

it('known wrong result: #2360 — uses square-root pressure units for the shear limit', () => {
  const copy = changes.find(c => c.id === 'cirsoc201-strain-compatibility')?.explanation.zh;
  expect(copy).toContain('√f′c ≤ 8.3 √MPa');
});
