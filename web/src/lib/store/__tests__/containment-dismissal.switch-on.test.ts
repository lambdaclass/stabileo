import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';
import { describe, it, expect, afterEach } from 'vitest';
import ContainmentBanner from '../../../components/ContainmentBanner.svelte';
import ProDiagnosticsTab from '../../../components/pro/ProDiagnosticsTab.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { containmentDismissal } from '../containment-dismissal.svelte';

const warning = { refused: false, messages: ['MITC4 #810', 'second order #1551'] };
const shown = (disposition: { refused: boolean; messages: string[] }) =>
  render(ContainmentBanner, { props: { disposition, preserveModel: true, children: createRawSnippet(() => ({ render: () => '<span>model</span>' })) } }).body;

afterEach(() => { containmentDismissal.restore(); resultsStore.clear(); uiStore.analysisMode = '3d'; });

describe('closing the analysis notice', () => {
  it('offers a close button on a warning and hides the notice once closed, keeping the model', () => {
    expect(shown(warning)).toContain('data-testid="containment-dismiss"');
    containmentDismissal.dismiss(warning.messages);
    const html = shown(warning);
    expect(html).not.toContain('containment-notice');
    expect(html).toContain('<span>model</span>');
  });

  it('speaks again when the messages change', () => {
    containmentDismissal.dismiss(warning.messages);
    expect(shown({ refused: false, messages: ['MITC4 #810'] })).toContain('containment-notice');
    expect(containmentDismissal.isDismissed(warning.messages)).toBe(true);
    containmentDismissal.restore();
    expect(shown(warning)).toContain('containment-notice');
  });

  it('closes a refusal too, by the engine\'s messages Diagnostics restores it by, the results still withheld', () => {
    const refusal = { refused: true, messages: ['refused'] };
    expect(shown(refusal)).toContain('data-testid="containment-dismiss"');
    containmentDismissal.dismiss(refusal.messages);
    expect(shown(refusal)).not.toContain('containment-notice');
    expect(render(ContainmentBanner, { props: { disposition: refusal } }).body).not.toContain('containment-notice');
  });

  it('keys an app notice by what it says and how grave it is, so a new one, or an advisory after a plain one, speaks again', () => {
    const outdated = (key: string, level: 'warning' | 'blocking' = 'warning') => ({ kind: 'outdated' as const, level, details: [], key });
    const withApp = (n: ReturnType<typeof outdated>) => render(ContainmentBanner, { props: { disposition: warning, extra: [n] } }).body;
    containmentDismissal.dismiss(warning.messages);
    expect(withApp(outdated('stale:2 changes'))).toContain('containment-notice');
    containmentDismissal.dismiss([...warning.messages, 'stale:2 changes']);
    expect(withApp(outdated('stale:2 changes'))).not.toContain('containment-notice');
    expect(withApp(outdated('advisory:2 changes', 'blocking'))).toContain('containment-notice');
  });
});

it('lists the notice in PRO Diagnostics, with a way to put it back over the model once closed', () => {
  uiStore.analysisMode = 'pro';
  resultsStore.setResults3D({ displacements: [], reactions: [], elementForces: [], structuredDiagnostics: [{ code: 'known_issue', severity: 'warning', phase: 'NUM-INVARIANCE', value: 762, message: 'ENGINE' }] } as never);
  const messages = resultsStore.knownIssues3D.messages;
  expect(messages.length).toBe(1);
  expect(render(ProDiagnosticsTab).body).toContain('#762');
  expect(render(ProDiagnosticsTab).body).not.toContain('containment-restore');
  containmentDismissal.dismiss(messages);
  const html = render(ProDiagnosticsTab).body;
  expect(html).toContain('#762');
  expect(html).toContain('data-testid="containment-restore"');
});
