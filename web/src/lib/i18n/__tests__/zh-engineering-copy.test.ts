import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { DEFAULT_BATCH } from '../../../components/tools/batch';
import { batchTranslations } from '../../../components/tools/batch-i18n';
import { calculateBatch } from '../../../components/tools/batch-solve';
import { EXAMPLE } from '../../../components/tools/calculators';
import { calculate } from '../../../components/tools/solve';
import { toolTranslations } from '../../../components/tools/translations';
import { STRINGS } from '../../../components/research/i18n';
import reliability from '../../blog/translations/zh/page-reliability';
import torsion from '../../blog/translations/zh/torsion-bredt-saint-venant';
import advisory from '../../blog/translations/zh/safety-advisories';
import { sheetSpec } from '../../excel-import/schema';
import bars from '../../blog/translations/zh/bars-or-finite-elements';
import determinism from '../../blog/translations/zh/the-determinism-boundary';
import { changes } from '../../provenance/result-changes/numbered.json';
import { ALL_DICTS } from '../locales/all';
import dynamics from '../locales/course/dynamics/zh';
import influence from '../locales/course/influence/zh';
import kinematics from '../locales/course/kinematics/zh';
import plastic from '../locales/course/plastic/zh';
import steel from '../locales/steel/zh';
import steps from '../locales/steps/zh';
import zh from '../locales/zh';

const copyCases: [string, string | undefined, RegExp][] = [
  ['biaxial bending lever arms', zh['stress.sigmaBiaxHelp'], /Mz·y\/Iz − My·z\/Iy/],
  ['single-source shear magnitude', zh['stress.tauTotalHelp'], /仅有横向剪应力或仅有扭转剪应力时的应力大小/],
  ['combined shear refusal', zh['stress.combinedShearRefused'], /扭转剪应力和横向剪应力均不为零.*无法提供合成剪应力、派生应力及验算结论/],
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

const reviewCases: [string, string | undefined, RegExp][] = [
  ['T-beam minimum reinforcement uses a width', zh['flex.step.teeHogging'], /计算 As,min（cm²）时.*宽度.*2·bw.*bf.*\{bmin\} cm/],
  ['3D fiber sliders distinguish drawing and member axes', zh['stress.fiberYZ3dHelp'], /图中 y（高度）对应杆件局部 z，代入 My·z\/Iy 项。图中 z（宽度）对应杆件局部 y，代入 Mz·y\/Iz 项/],
  ['fixed-end check uses the resultant of the applied loads along −y', steps['steps.fem.check'], /R 是沿局部 −y 取正的荷载合力.*R = Vᵢⱼ \+ Vⱼᵢ.*向下荷载.*向上反力/],
  ['frame stiffness is expressed as a ratio to the shell', bars.blocks.map(b => b.k === 'p' ? b.t : '').join('\n'), /刚度约为壳模型的 2\.23 倍/],
];

it.each(reviewCases)('known wrong result: #2360 — %s', (_name, copy, expected) => {
  expect(copy).toMatch(expected);
});

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


it.each([
  ['clockwise command', zh['ctx.rotate90cw'], /^顺时针旋转 90° ↻$/],
  ['counterclockwise command', zh['ctx.rotate90ccw'], /^逆时针旋转 90° ↺$/],
  ['displayed bending moment signs use different local axes', zh['stress.moments3dHelp'], /显示的 My 为正时.*局部 \+z.*受拉.*显示的 Mz 为正时.*局部 −y.*受拉/s],
  ['the Navier formula uses the solver moment signs', zh['stress.sigmaBiaxHelp'], /式中弯矩取求解器符号，与面板上方所显示的弯矩符号相反/],
  ['dynamic amplification tends to zero as β increases', dynamics['course.dynamics.sdof.harm.above'], /D = 1.*频率比 β 趋于 √2.*β.*增大.*D 趋于零/],
  ['zonal envelope dead load covers eligible members at both extremes', influence['course.influence.doc.use.worst.zones'], /求最大值和最小值时，g 均布置在所有允许加载的杆件上/],
  ['whole-member envelope dead load covers eligible members at both extremes', influence['course.influence.doc.use.worst.spans'], /求最大值和最小值时，g 均布置在所有允许加载的杆件上/],
  ['worked compression converts N to kN', steel['c301.e.pn'], /\{Fcr\}·\{Ag\} × 10⁻³ = \{Pn\} kN/],
  ['worked shear converts N to kN', steel['c301.g.vn'], /0\.6·\{Fy\}·\{Aw\}·\{Cv\} × 10⁻³ = \{Vn\} kN/],
  ['moment distribution excludes released far ends from carry-over', steps['steps.frames.cross.distIntro'], /远端固结.*传递一半.*远端为铰.*传递量为零/],
  ['inextensible mixed frames retain span-load effects on hinged members', steps['steps.trusses.compat.inext.mixed'], /两端弯矩为零.*跨内横向荷载.*剪力和弯矩/],
  ['compatibility releases remove end moments and retain span-load effects', steps['steps.trusses.compat.hinges'], /两端弯矩为零.*跨内横向荷载.*剪力和弯矩/],
] as const)('#2360 — %s', (_name, copy, expected) => {
  expect(copy).toMatch(expected);
});

it('#2360 — material strength and nodal force have distinct Excel help', () => {
  const material = sheetSpec('Materials')!;
  const materialFy = material.columns.find(column => column.key === 'fy')!;
  const loadFy = sheetSpec('Loads')!.columns.find(column => column.key === 'fy')!;
  expect(loadFy.unit).toBe('kN');
  expect(zh[loadFy.helpKey]).toBe('沿 Y 方向的力。');
  expect(materialFy.unit).toBe('MPa');
  expect(materialFy.helpKey).not.toBe(loadFy.helpKey);
  expect(zh[materialFy.helpKey]).toMatch(/屈服强度.*混凝土.*f′c.*MPa/);
});

it('#2360 — cable advice retains self-weight in the independent check', () => {
  const heading = advisory.blocks.findIndex(block => block.k === 'h' && block.t.startsWith('SA-2026-015'));
  const advice = advisory.blocks[heading + 2];
  expect(advice.k === 'ul' && advice.items[1]).toMatch(/独立复核.*索力和锚固力.*计入索的自重/);
  expect(advice.k === 'ul' && advice.items[1]).not.toContain('不设密度');
});

it('#2360 — reliability points readers to current advisory statuses', () => {
  expect(reliability.faq?.find(entry => entry.q === '已发布的公告都修复了吗？')?.a)
    .toMatch(/仍有问题尚未修复.*安全公告.*最新状态/);
  expect(reliability.blocks).toContainEqual(expect.objectContaining({ k: 'link', slug: 'safety-advisories' }));
});

it('#2360 — torsion error percentages use the exact stress as denominator', () => {
  const explanation = torsion.blocks.find(block => block.k === 'p' && block.t.startsWith('在这四种情形中'));
  expect(explanation).toMatchObject({ k: 'p', t: expect.stringMatching(/以精确值为基准.*低 4\.5%.*低 8\.2%/) });
});

const releaseNotes = readFileSync(new URL('../../../../../docs/releases/v0.6.2.zh.md', import.meta.url), 'utf8');
const releaseNotices = [
  {
    version: 91,
    title: '平面塑性分析拒绝小于限值的杆件荷载区间',
    link: '../results-changes/2026-11-narrow-partial-loads.md#compensated-force-totals-and-remapped-load-refusal-round-67-2223',
  },
  {
    version: 93,
    title: '3D 支座约束含义不明时拒绝截面设计',
    link: '../results-changes/2026-11-roller-z-fixed.md#custom-supports-require-an-explicit-mask',
  },
] as const;

function expectReleaseNotices(release: string) {
  const notices = release.split('\n').filter(line => /^\| (91|93) \|/.test(line));
  expect(notices).toHaveLength(new Set(notices).size);
  for (const { version, title, link } of releaseNotices) {
    const versionPrefix = `| ${version} | `;
    const titleCell = `[${title}]`;
    const linkSuffix = `(${link}) |`;
    const rows = notices.filter(line =>
      line.startsWith(versionPrefix) && (line.startsWith(versionPrefix + titleCell) || line.endsWith(linkSuffix)),
    );
    expect(rows).toEqual([versionPrefix + titleCell + linkSuffix]);
  }
}

it('#2360 — Chinese release notes distinguish repeated result notice titles', () => {
  expectReleaseNotices(releaseNotes);
});

it('#2360 — release-note validation rejects identical titles across versions', () => {
  const release = releaseNotes.replace(releaseNotices[1].title, releaseNotices[0].title);
  expect(() => expectReleaseNotices(release)).toThrow();
});

it('#2360 — release-note validation rejects missing versions even when their anchors remain', () => {
  const release = releaseNotes.replace(/^\| (91|93) \|/gm, '| 94 |');
  expect(() => expectReleaseNotices(release)).toThrow();
});

it('#2360 — release-note validation rejects duplicate anchors within a version', () => {
  const { version, link } = releaseNotices[0];
  const release = releaseNotes + `\n| ${version} | [另一条说明](${link}) |\n`;
  expect(() => expectReleaseNotices(release)).toThrow();
});

it('#2360 — concentrated live load guidance formats the advisory reference for each page', () => {
  const row = releaseNotes.split('\n').find(line => line.startsWith('| [SA-2026-083]'));
  expect.soft(row?.split('|')[3]).toMatch(/^ CIRSOC 101 自动荷载生成/);
  const description = advisory.blocks.flatMap(block => block.k === 'table' ? block.rows : [])
    .find(columns => columns[0] === 'SA-2026-083')?.[1];
  expect.soft(description).toMatch(/^SA-2026-083：CIRSOC 101 自动荷载生成/);
});

const engineeringCopy = process.env.RUN_KNOWN_WRONG === '2384' ? it : it.skip;

engineeringCopy('known wrong result: #2384 — the modal warning uses the material unit weight', () => {
  const unit = sheetSpec('Materials')!.columns.find(column => column.key === 'rho')!.unit;
  expect(unit).toBe('kN/m³');
  expect.soft(zh['modal.noDensity']).toMatch(/重度.*重度/);
  expect.soft(ALL_DICTS.en['modal.noDensity']).toMatch(/unit weight.*unit weight/);
  for (const [locale, copy] of Object.entries(ALL_DICTS)) {
    expect.soft(copy['modal.noDensity'], locale).toContain(unit);
    expect.soft(copy['modal.noDensity'], locale).not.toMatch(/(?:kg|кг)\/m³|кг\/м³/);
  }
});

engineeringCopy('known wrong result: #2384 — the beam, frame and influence tools describe the signed shear on both cut faces', async () => {
  const beam = await calculate('simply-supported-beam', EXAMPLE);
  const [beamX, beamV] = beam.charts.shear.find(([x]) => x > 0)!;
  expect(beamX).toBeLessThan(EXAMPLE.length / 2);
  expect(beamV).toBeCloseTo(EXAMPLE.load * (EXAMPLE.length / 2 - beamX), 6);

  const portalInput = { ...DEFAULT_BATCH, horizontal: 0 };
  const portal = await calculateBatch('portal-frame', portalInput);
  const [portalX, portalV] = portal.charts.shear.find(({ name }) => name === '2')!.points.find(([x]) => x > 0)!;
  expect(portalV).toBeCloseTo(portalInput.load * (portalInput.length / 2 - portalX), 6);

  const influenceInput = { ...DEFAULT_BATCH, quantity: 'shear' as const };
  const line = await calculateBatch('influence-line', influenceInput);
  const [leftX, leftV] = line.influence.find(([x]) => x > 0 && x < influenceInput.position)!;
  const [rightX, rightV] = line.influence.find(([x]) => x > influenceInput.position && x < influenceInput.length)!;
  expect(leftV).toBeCloseTo(-leftX / influenceInput.length, 6);
  expect(rightV).toBeCloseTo(1 - rightX / influenceInput.length, 6);

  for (const copy of [
    toolTranslations.zh['tools.signConvention'],
    batchTranslations.zh['tools.batch.signConvention'],
    batchTranslations.zh['tools.batch.influenceSign'],
  ]) {
    expect.soft(copy).toMatch(/左段切面向下.*右段切面向上/);
  }
  for (const copy of [
    toolTranslations.en['tools.signConvention'],
    batchTranslations.en['tools.batch.signConvention'],
    batchTranslations.en['tools.batch.influenceSign'],
  ]) {
    expect.soft(copy).toMatch(/downward on the cut face of the left segment.*upward on the cut face of the right segment/);
  }
});

engineeringCopy('known wrong result: #2384 — underdamped settling depends on the permitted residual amplitude', () => {
  const key = 'course.dynamics.sdof.total.why';
  expect.soft(dynamics[key]).toMatch(/e\^\(−ξωt\).*允许的残余幅值比例.*ln\(1\/ε\)\/\(ξω\)/);
  expect.soft(dynamics[key]).not.toContain('经过几个周期后只剩稳态');
  expect.soft(ALL_DICTS.en[key]).toMatch(/e\^\(−ξωt\).*acceptable residual amplitude.*ln\(1\/ε\)\/\(ξω\)/);
  expect.soft(ALL_DICTS.en[key]).not.toContain('after a few cycles');
});

engineeringCopy('known wrong result: #2384 — the plastic lesson defines its axis and reconciles the influence-line axis', () => {
  const key = 'course.plastic.doc.signs';
  expect.soft(plastic[key]).toMatch(/局部 x 轴.*起始节点.*终止节点.*局部 y 轴.*逆时针.*局部 −y.*局部 −z/);
  expect.soft(ALL_DICTS.en[key]).toMatch(/local x.*start node.*end node.*local y.*counterclockwise.*local −y.*local −z/);
  expect(influence['course.influence.doc.sign.M']).toMatch(/局部 −z.*受拉时为正/);
});

engineeringCopy('known wrong result: #2384 — axial stiffness times elongation gives axial force', () => {
  const key = 'course.kinematics.dm.introStates';
  expect.soft(kinematics[key]).toMatch(/弯矩[^。]*。[^。]*轴力 N = \(EA\/L\)·ΔL.*伸长/);
  expect.soft(ALL_DICTS.en[key]).toMatch(/moments[^.]*\. [^.]*axial force N = \(EA\/L\)·ΔL.*elongation/);
});

engineeringCopy('known wrong result: #2384 — the Castigliano option integrates axial strain energy along the member', () => {
  const key = 'steps.m.castigliano.opt.axial.label';
  expect.soft(steps[key]).toContain('轴向应变能');
  expect.soft(ALL_DICTS.en[key]).toContain('axial strain energy');
  for (const [locale, copy] of Object.entries(ALL_DICTS)) {
    if (key in copy) expect.soft(copy[key], locale).toContain('∫ N²/(2EA) dx');
  }
});
