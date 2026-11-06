import { describe, it, expect } from 'vitest';
import { CodedRefusal, asCodedRefusal, isContainmentRefusal, refusedWithCode } from '../containment-error';

const coded = (code: string, message: string, severity = 'error') =>
  new Error(JSON.stringify({ message, structuredDiagnostics: [{ code, severity, message }] }));

describe('coded engine refusals', () => {
  it('match on the code whatever the message says', () => {
    for (const message of ['No free DOFs', 'Every degree of freedom is restrained', '']) {
      expect(refusedWithCode(coded('no_free_dofs', message), 'no_free_dofs')).toBe(true);
    }
  });

  it('do not match on the text of an uncoded error', () => {
    expect(refusedWithCode(new Error('No free DOFs'), 'no_free_dofs')).toBe(false);
    expect(refusedWithCode('No free DOFs', 'no_free_dofs')).toBe(false);
  });

  it('match only an error-severity diagnostic with that code', () => {
    expect(refusedWithCode(coded('no_free_dofs', 'x', 'warning'), 'no_free_dofs')).toBe(false);
    expect(refusedWithCode(coded('known_issue', 'No free DOFs'), 'no_free_dofs')).toBe(false);
    expect(isContainmentRefusal(coded('no_free_dofs', 'x'))).toBe(false);
    expect(isContainmentRefusal(coded('known_issue', 'x'))).toBe(true);
  });

  it('become a CodedRefusal with the engine message when converted for that code', () => {
    const plain = asCodedRefusal(coded('no_free_dofs', 'No free DOFs'), 'no_free_dofs');
    expect(plain).toBeInstanceOf(CodedRefusal);
    expect(plain).toMatchObject({ message: 'No free DOFs', code: 'no_free_dofs' });
    expect(refusedWithCode(plain, 'no_free_dofs')).toBe(true);
    expect(refusedWithCode(plain, 'known_issue')).toBe(false);
    const other = new Error('Singular matrix');
    expect(asCodedRefusal(other, 'no_free_dofs')).toBe(other);
  });

  it('do not match, and stay intact, when the same error is also a containment refusal (#1558)', () => {
    const both = new Error(JSON.stringify({ message: 'withheld', structuredDiagnostics: [
      { code: 'no_compressed_elements', severity: 'error', message: 'coded' },
      { code: 'known_issue', severity: 'error', message: 'withheld' },
    ] }));
    expect(refusedWithCode(both, 'no_compressed_elements')).toBe(false);
    expect(refusedWithCode(both, 'known_issue')).toBe(true);
    expect(isContainmentRefusal(both)).toBe(true);
    expect(asCodedRefusal(both, 'no_compressed_elements')).toBe(both);
    expect(refusedWithCode(coded('known_issue', 'x', 'warning'), 'known_issue')).toBe(false);
    const warned = new Error(JSON.stringify({ message: 'm', structuredDiagnostics: [
      { code: 'no_free_dofs', severity: 'error', message: 'coded' }, { code: 'known_issue', severity: 'warning', message: 'w' },
    ] }));
    expect(refusedWithCode(warned, 'no_free_dofs')).toBe(true);
  });

  it('a CodedRefusal for containment is one, and a CodedRefusal whose message carries containment is not its own code (#1558)', () => {
    const contained = new CodedRefusal('withheld', 'known_issue');
    expect(isContainmentRefusal(contained)).toBe(true);
    expect(refusedWithCode(contained, 'known_issue')).toBe(true);
    expect(refusedWithCode(contained, 'no_compressed_elements')).toBe(false);
    const wrapped = new CodedRefusal(JSON.stringify({ message: 'withheld', structuredDiagnostics: [{ code: 'known_issue', severity: 'error', message: 'withheld' }] }), 'no_compressed_elements');
    expect(isContainmentRefusal(wrapped)).toBe(true);
    expect(refusedWithCode(wrapped, 'no_compressed_elements')).toBe(false);
    expect(asCodedRefusal(wrapped, 'no_compressed_elements')).toBe(wrapped);
  });

  it('are left intact when converted for another code, so a containment refusal stays one', () => {
    const contained = coded('known_issue', 'BU-BOUND');
    expect(asCodedRefusal(contained, 'eigen_decomposition_failed')).toBe(contained);
    expect(isContainmentRefusal(asCodedRefusal(contained, 'no_compressed_elements'))).toBe(true);
  });
});
