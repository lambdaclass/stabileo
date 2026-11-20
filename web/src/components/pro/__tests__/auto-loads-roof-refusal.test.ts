import { render } from 'svelte/server';
import { afterEach, expect, it, vi } from 'vitest';
import ProAutoLoadsDialog from '../ProAutoLoadsDialog.svelte';
import * as defaults from '../auto-loads-memory';
import { modelStore, uiStore } from '../../../lib/store';
import { setLocale } from '../../../lib/i18n';
import { teAt } from '../../../lib/i18n/engine-text';

const reason = 'loadPlan.gravity.memberSlopeLimit';

afterEach(() => {
  modelStore.clear();
  vi.restoreAllMocks();
});

function renderDialog(rise: number) {
  uiStore.analysisMode = 'pro';
  setLocale('en');
  modelStore.clear();
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(Math.sqrt(3), 0, rise);
  const id = modelStore.addElement(a, b);
  const settings = defaults.autoLoadsDefaults();
  settings.snowCfg.enabled = true;
  vi.spyOn(defaults, 'autoLoadsDefaults').mockReturnValue(settings);
  return { id, body: render(ProAutoLoadsDialog, { props: { open: true, onclose: () => {} } }).body };
}

it('#2254 the dialog shows the carrier slope refusal and withholds the preview', () => {
  const { body, id } = renderDialog(1);
  const warning = teAt({ key: reason, params: { id } }, 'en');
  expect(warning).not.toBe(reason);
  expect(body).toContain(`data-testid="al-roof-geometry-refused">${warning}</p>`);
  expect(body).not.toContain('data-testid="al-preview-btn"');
  expect(body).not.toContain('data-testid="al-apply"');
  expect(body).not.toContain('data-testid="al-nav-status-snow"');
});

it.each([0.999, 1.001])('keeps the load preview available at an unambiguous rise of %s', rise => {
  const { body } = renderDialog(rise);
  expect(body).toContain('data-testid="al-preview-btn"');
  expect(body).not.toContain('data-testid="al-roof-geometry-refused"');
  expect(body).toContain('data-testid="al-nav-status-snow"');
});
