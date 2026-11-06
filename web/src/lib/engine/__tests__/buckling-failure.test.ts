import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bucklingFailureToast } from '../buckling-failure';
import { CodedRefusal } from '../containment-error';

const t = (key: string) => key;
const diagnostics = (...codes: string[]) => new Error(JSON.stringify({ message: 'withheld', structuredDiagnostics: codes.map((code) => ({ code, severity: 'error', message: code })) }));

describe('the advanced toolbar buckling failure toast', () => {
  it('says "no compression" as information for that coded refusal', () => {
    expect(bucklingFailureToast(new CodedRefusal('x', 'no_compressed_elements'), t)).toEqual({ text: 'toast.bucklingNoCompression', kind: 'info' });
    expect(bucklingFailureToast(diagnostics('no_compressed_elements'), t)).toEqual({ text: 'toast.bucklingNoCompression', kind: 'info' });
  });

  it('is an error, not "no compression", when the refusal also carries a containment refusal', () => {
    const toast = bucklingFailureToast(diagnostics('no_compressed_elements', 'known_issue'), t);
    expect(toast.kind).toBe('error');
    expect(toast.text).not.toBe('toast.bucklingNoCompression');
  });

  it('is what ToolbarAdvanced shows', () => {
    const source = readFileSync(new URL('../../../components/toolbar/ToolbarAdvanced.svelte', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('  function bucklingFailure('), source.indexOf('\n  }', source.indexOf('  function bucklingFailure(')));
    expect(body).toContain('bucklingFailureToast(e, t)');
    expect(source).not.toContain("refusedWithCode(e, 'no_compressed_elements')");
  });
});
