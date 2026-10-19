/**
 * The per-member certificates a detailing document carries, read out of the verification store.
 * Split from `detailing-project-inputs.ts` to keep it under the 500-line ceiling
 * (`detailing-store-ceiling.test.ts`); that file re-exports it.
 */
import { verificationStore } from './verification.svelte';
import { loadSplitNotEstablished } from './analysis-validity-store';
import { rebarHash } from '../engine/design/rebar-hash';
import type { CertificateEntry } from '../engine/detailing/document-model';

/**
 * The per-member verification certificate every document carries.
 *
 * ── Why it is a reading and not a store method ─────────────────────
 *
 * It answers one question per element — what was certified, what is there now, and whether the
 * two are the same claim — out of `verificationStore`, and holds nothing. That is what this
 * file is for, and moving it here is what keeps `detailing.svelte.ts` inside the 800-line
 * ceiling `detailing-store-ceiling.test.ts` enforces.
 *
 * The `verifierId` comes from the ASSEMBLY that owns the member, not from the project: it is
 * the identity of the verifier that actually ran for that steel.
 */
export function collectCertificates(
  assemblies: readonly {
    elementIds: number[]; provenance: { verifierId: string };
  }[],
): CertificateEntry[] {
  const out: CertificateEntry[] = [];
  for (const a of assemblies) {
    for (const id of a.elementIds) {
      const reinf = verificationStore.reinforcementFor(id);
      const result = verificationStore.providedFor(id);
      const current = reinf ? rebarHash(reinf) : '';
      const certified = verificationStore.certifiedHashFor(id);
      out.push({
        elementId: id,
        certifiedHash: certified,
        currentHash: current,
        // Empty on either side means the question was never answered, which is not a match.
        // Silence is not agreement.
        matches: certified !== '' && current !== '' && certified === current,
        verifierId: a.provenance.verifierId,
        // A deflection over its limit (Tabla 24.2.2) fails the certificate, as it fails the desk.
        status: result?.overallStatus === 'fail' || (/^(ok|warn)$/.test(result?.overallStatus ?? '') && verificationStore.serviceabilityFails(id)) ? 'fail'
          : result?.overallStatus === 'ok' ? 'ok' : result?.overallStatus === 'warn' ? 'warn' : 'notRun',
        provisional: verificationStore.outcomeFor(id)?.outcome === 'PROVISIONAL_BIAXIAL',
        ...(loadSplitNotEstablished(id) ? { loadSplit: 'notEstablished' as const } : {}),
      });
    }
  }
  return out;
}
