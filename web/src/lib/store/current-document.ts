/**
 * The document every output of the design builds from, resolved one way wherever it is asked:
 * the documentable members, narrowed by the design's family selection and the scope asked for,
 * built by the detailing store with the project's author. The documents place, the sheets and
 * the listings read it from here, so the three cannot cover different members.
 *
 * `null` when nothing is documentable yet or nothing is coordinated; `blocker` says which.
 */
import { t } from '../i18n';
import { detailingStore } from './detailing.svelte';
import { detailingSheet } from './detailing-sheet.svelte';
import { detailingAuthor } from './detailing-author.svelte';
import { designRunStore } from './design-run.svelte';
import { documentScope } from './document-scope.svelte';
import { documentableMembers } from './detailing-project-inputs';
import { documentScopeBlocker, resolveDocumentScope } from '../flow/rc-document-scope';
import type { DocumentModel } from '../engine/detailing/document-model';

/** What the next output covers: resolved on each call (an export is one gesture and one tick). */
export function currentScope() {
  return resolveDocumentScope({ members: documentableMembers(), designFamilies: designRunStore.familySelection, requested: documentScope.requested });
}

/** The document, or why there is none: `scope` (nothing documentable or selected) or `coordinated` (no coordinated bars). */
export function currentDocument(): { doc: DocumentModel; blocker: null } | { doc: null; blocker: { kind: 'scope'; key: string } | { kind: 'coordinated' } } {
  const scope = currentScope();
  const blocked = documentScopeBlocker(scope);
  if (blocked) return { doc: null, blocker: { kind: 'scope', key: `detailing.doc.select.${blocked}` } };
  const doc = detailingStore.buildDocument({
    author: detailingAuthor.resolve(t('detailing.doc.unnamedAuthor')),
    at: new Date().toISOString(),
    // Only when it is a narrowing: a whole set carries no selection to declare.
    scope: scope.whole ? null : { elements: scope.elements, families: scope.families },
  });
  return doc ? { doc, blocker: null } : { doc: null, blocker: { kind: 'coordinated' } };
}

/** What heads every output: the project's rótulo, else the generic word. */
export const documentProjectName = (): string => detailingSheet.titleBlockConfig.project || t('detailing.doc.project');
