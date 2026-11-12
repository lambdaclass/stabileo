import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { axesStore } from '../axes.svelte';
import { axisTokensIn, caseNameShown, combinationNameShown } from '../case-names';
import { makeFrame, type AxesChoice } from '../frame';
import { planeDistributedLoad } from '../display';
import { planeLettersShown, supportNameShown, supportTypeShown, userAxisText } from '../user-names';
import { columnHelpIn } from '../../excel-import/template';
import { modelStore, resultsStore, uiStore } from '../../store';
import { generateReportHtml, type ReportConfig } from '../../engine/pro-report';
import { buildProReportData } from '../../engine/pro-report-inputs';
import { withPresentation } from '../../pro/report-export';
import { teAt } from '../../i18n/engine-text';
import { initSolver } from '../../engine/wasm-solver';
import { t } from '../../i18n';

afterEach(() => axesStore.reset());

const Y_UP: AxesChoice = { up: '+Y', right: '+X', hand: 'right' };
const MIRRORED: AxesChoice = { up: '-Z', right: '-X', hand: 'right' };
const SRC = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

describe('generated case names', () => {
  it('a name Stabileo wrote reads in the user axes; one the user typed is never touched', () => {
    axesStore.choice = Y_UP;
    expect(caseNameShown({ name: 'Viento +Y, caso 1', axisNamed: true })).toBe('Viento −Z, caso 1');
    expect(caseNameShown({ name: 'Sismo X (+5 % excentricidad)', axisNamed: true })).toBe('Sismo X (+5 % excentricidad)');
    expect(caseNameShown({ name: 'Sismo Y', axisNamed: true })).toBe('Sismo Z');
    expect(caseNameShown({ name: 'N -X · D', axisNamed: true })).toBe('N -X · D');
    expect(caseNameShown({ name: 'Viento +Y' })).toBe('Viento +Y');
    axesStore.choice = MIRRORED;
    expect(caseNameShown({ name: 'Wind +X+Y', axisNamed: true })).toBe('Wind −X+Y');
  });

  it('a generated combination reads in the user axes until the user renames it', () => {
    axesStore.choice = Y_UP;
    expect(combinationNameShown({ name: '1.0 D + 1.6 W (Viento +Y)', origin: {} })).toBe('1.0 D + 1.6 W (Viento −Z)');
    expect(combinationNameShown({ name: '1.0 D + 1.6 W (Viento +Y)', origin: {}, nameTyped: true })).toBe('1.0 D + 1.6 W (Viento +Y)');
    expect(combinationNameShown({ name: 'Mine Y' })).toBe('Mine Y');
  });

  it('the default frame leaves every name as stored', () => {
    expect(axisTokensIn(makeFrame({ up: '+Z', right: '+X', hand: 'right' }), 'Viento +X')).toBe('Viento +X');
  });

  it('the store marks a generated case, and a rename makes it the user\'s', () => {
    modelStore.clear();
    const id = modelStore.addLoadCase('Viento +X', 'W', { axisNamed: true });
    const plain = modelStore.addLoadCase('Viento +X', 'W');
    const none = modelStore.addLoadCase('Peso propio', 'D', { axisNamed: true });
    const lc = () => modelStore.model.loadCases.find((c) => c.id === id)!;
    expect(lc().axisNamed).toBe(true);
    expect(modelStore.model.loadCases.find((c) => c.id === plain)!.axisNamed).toBeUndefined();
    expect(modelStore.model.loadCases.find((c) => c.id === none)!.axisNamed).toBeUndefined();
    modelStore.updateLoadCase(id, 'Viento norte X');
    expect(lc().axisNamed).toBeUndefined();
  });

  it('the generators\' messages name their direction in the user axes', () => {
    axesStore.choice = Y_UP;
    expect(teAt({ key: 'loadPlan.note.modalMassShort', params: { dir: 'Y', ratio: 0.8 } } as never, 'en')).not.toMatch(/\bY\b/);
  });

  it('the generators name their cases through the flag, and the lists show them', () => {
    expect(read('lib/store/apply-load-plan.ts')).toContain('axisNamed: true');
    for (const f of ['components/pro/ProLoadCases.svelte', 'components/toolbar/ResultsViewPicker.svelte', 'components/tables/LoadsTable.svelte', 'components/pro/ProCombinationsList.svelte', 'lib/pro/export-results.ts', 'lib/engine/pro-report-inputs.ts', 'lib/store/project-workbook.ts', 'lib/pro/dxf-export.ts']) {
      expect(read(f), f).toMatch(/caseNameShown|caseNameIn|combinationNameShown/);
    }
  });
});

describe('support names', () => {
  it('a roller id is shown in the user axes, the 2D ones on the plane', () => {
    axesStore.choice = Y_UP;
    expect(supportTypeShown('rollerXY')).toBe('rollerXZ');
    expect(supportTypeShown('rollerYZ')).toBe('rollerYZ');
    expect(supportTypeShown('rollerX')).toBe('rollerX');
    expect(supportTypeShown('rollerZ')).toBe('rollerY');
    expect(supportTypeShown('rollerY')).toBe('rollerY');
    expect(supportNameShown('rollerXY', 'Roller XY')).toBe('Roller XZ');
    expect(supportNameShown('rollerZ', 'Roller Y')).toBe('Roller Y');
    expect(planeLettersShown('Global axes: X horizontal, Z vertical')).toBe('Global axes: X horizontal, Y vertical');
    axesStore.choice = { up: '+X', right: '+Y', hand: 'right' };
    expect(supportTypeShown('rollerZ')).toBe('rollerX');
    expect(planeLettersShown('Restrains vertical displacement (Z reaction). Free in X.')).toBe('Restrains vertical displacement (X reaction). Free in Y.');
  });

  it('every place that shows a support type goes through the user names', () => {
    expect(read('lib/engine/calc-report.ts')).toContain('supportTypeShown(s.type)');
    expect(read('lib/engine/pro-report.ts')).toContain('supportTypeIn(frame, s.type)');
    expect(read('lib/export/excel.ts')).toContain('supportTypeShown(sup.type)');
    expect(read('components/tables/SupportsTable.svelte')).toContain("planeLettersShown(t('table.rollerY'))");
    expect(read('components/floating-tools/SelectedEntityPanel.svelte')).toContain('supportNameShown(selectedSup.type');
    expect(read('lib/ai/capabilities/build-model.ts')).toContain('supportTypeShown(');
  });

  it('a 3D load button\'s title describes the user axis it is', () => {
    axesStore.choice = Y_UP;
    const tr = (k: string) => ({ 'float.loadForceZ3d': 'Force in Z (vertical)', 'float.loadForceY3d': 'Force in Y' } as Record<string, string>)[k] ?? k;
    expect(userAxisText(tr, (m) => `float.loadForce${m}3d`, 'Y')).toBe('Force in Y (vertical)');
    expect(userAxisText(tr, (m) => `float.loadForce${m}3d`, 'Z')).toBe('Force in Z');
  });
});

describe('the Excel template', () => {
  it('a user-axis column is explained as the model axis it stands for', () => {
    const f = makeFrame(Y_UP);
    expect(columnHelpIn(f, 'xls.col.y')).toBe(columnHelpIn(makeFrame({ up: '+Z', right: '+X', hand: 'right' }), 'xls.col.z').replace(/\bZ\b/g, 'Y'));
    expect(columnHelpIn(f, 'xls.col.qzi')).toBe(t('xls.col.qzi'));
  });
});

describe('Basic 2D distributed loads from either view', () => {
  it('a global load is written as the 2D tool writes it, whatever the frame', () => {
    expect(planeDistributedLoad(-10, -5, 30, true)).toEqual({ qI: -10, qJ: -5, angle: 30, isGlobal: true });
    expect(planeDistributedLoad(-10, -5, 0, false)).toEqual({ qI: -10, qJ: -5, angle: undefined, isGlobal: undefined });
    axesStore.choice = MIRRORED;
    expect(planeDistributedLoad(-10, -5, 30, true)).toEqual({ qI: 10, qJ: 5, angle: 30, isGlobal: true });
    axesStore.choice = { up: '-Z', right: '+X', hand: 'right' };
    expect(planeDistributedLoad(-10, -5, 30, true)).toEqual({ qI: 10, qJ: 5, angle: -30, isGlobal: true });
    expect(planeDistributedLoad(-10, -5, 30, false)).toEqual({ qI: -10, qJ: -5, angle: 30, isGlobal: undefined });
  });

  it('the 3D view of a 2D model takes the global flag and the angle, as the 2D view does', () => {
    const v3 = read('components/Viewport3D.svelte'), v2 = read('components/Viewport.svelte');
    const call = 'planeDistributedLoad(uiStore.loadValue, uiStore.loadValueJ, uiStore.loadAngle, uiStore.loadIsGlobal)';
    expect(v3).toContain(call);
    expect(v2).toContain(call);
    expect(v3).not.toContain('addDistributedLoad(elemId, uiStore.loadValue, uiStore.loadValueJ, undefined, undefined');
  });
});

describe('the PRO report keeps its presentation', () => {
  beforeAll(async () => { await initSolver(); });

  const config = (): ReportConfig => ({
    companyName: '', companyLogo: null,
    sections: { modelData: true, results: false, advancedAnalysis: false, storyDrift: false, diagnostics: false, quantities: false, loads: false },
  });

  it('a plane model printed standing prints standing again, whatever the view does meanwhile', () => {
    uiStore.analysisMode = 'pro';
    modelStore.clear(); resultsStore.clear();
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 3);
    modelStore.addElement(a, b);
    resultsStore.setResults3D({ displacements: [], reactions: [], elementForces: [] } as never);
    const stored = withPresentation(config());
    expect(typeof stored.uprightPlane).toBe('boolean');
    const standing = generateReportHtml(buildProReportData({ config: { ...config(), uprightPlane: true }, t })!);
    const lying = generateReportHtml(buildProReportData({ config: { ...config(), uprightPlane: false }, t })!);
    const row = (html: string) => /<tr><td>2<\/td><td class="num">([^<]*)<\/td><td class="num">([^<]*)<\/td><td class="num">([^<]*)<\/td>/.exec(html)!.slice(1).map((v) => Number(v.replace(',', '.')));
    expect(row(standing)).toEqual([4, 0, 3]);
    expect(row(lying)).toEqual([4, 3, 0]);
    uiStore.viewportPresentation3D = uiStore.viewportPresentation3D === 'native3d' ? 'upright2dIn3d' : 'native3d';
    expect(row(generateReportHtml(buildProReportData({ config: { ...config(), uprightPlane: true }, t })!))).toEqual([4, 0, 3]);
  });
});
