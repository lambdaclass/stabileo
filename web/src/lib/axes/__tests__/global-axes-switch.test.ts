import { expect, it, vi } from 'vitest';
import { featuresForMode } from '../../../../config/public-features.mjs';
import { DEFAULT_AXES } from '../frame';
import { axesStore } from '../axes.svelte';
import * as XLSX from 'xlsx';
import { codeToModel, modelToCode } from '../../model/code/format';
import { parseWorkbook } from '../../excel-import/parse';
import { buildTemplateWorkbook } from '../../excel-import/template';
import { modelStore } from '../../store';
import { t } from '../../i18n';

it('known wrong result: #1986 a production-disabled build ignores a stored or requested global frame', () => {
  expect(featuresForMode('production')).toHaveProperty('globalAxes', false);
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
  try {
    axesStore.choice = { up: '-Y', right: '-X', hand: 'left' };
    axesStore.pickerOpen = true;
    expect(axesStore.choice).toEqual(DEFAULT_AXES);
    expect(axesStore.pickerOpen).toBe(false);
  } finally {
    vi.unstubAllGlobals();
    axesStore.reset();
  }
});

it('the disabled model-code and workbook entry points refuse an explicitly authored custom frame', () => {
  const choice = { up: '-Y', right: '-X', hand: 'left' } as const;
  const snap = modelStore.snapshot();
  const framed = modelToCode(snap, choice);
  expect(framed).toContain('frame up=');
  vi.stubGlobal('__PUBLIC_FEATURES__', featuresForMode('production'));
  try {
    expect(modelToCode(snap, choice)).toBe(modelToCode(snap));
    expect(codeToModel(framed).snapshot).toBeNull();
    const canonical = { Nodes: [['id', 'x', 'z'], [1, 2, 3]] };
    expect(parseWorkbook(canonical).model.nodes).toHaveLength(1);
    const workbook = { ...canonical, Axes: [['up', 'right', 'hand'], [choice.up, choice.right, choice.hand]] };
    const refused = parseWorkbook(workbook);
    expect(refused.problems).toEqual([{ sheet: 'Axes', row: 2, message: t('xls.err.axesDisabled') }]);
    expect(refused.model.nodes).toEqual([]);
    expect(buildTemplateWorkbook(XLSX as never, choice).SheetNames).toEqual(buildTemplateWorkbook(XLSX as never).SheetNames);
  } finally {
    vi.unstubAllGlobals();
  }
});
