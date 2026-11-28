import { unifiedPlates } from '../features';

export function withoutIssueRef(text: string): string {
  return unifiedPlates() ? text.replace(/\s*\(#\d+\)/g, '') : text;
}
