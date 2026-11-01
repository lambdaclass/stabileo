import type { StructuredDiagnostic } from '../../lib/engine/types';
import { knownIssueMessage } from '../../lib/engine/known-issues';

export function solverMessages(diagnostics: StructuredDiagnostic[], translate: (key: string) => string): string[] {
  return diagnostics.filter(d => d.severity !== 'info').map(d => {
    const known = knownIssueMessage(d);
    return known !== d.message ? known : translate('tools.solverWarning').replace('{code}', d.code);
  });
}
