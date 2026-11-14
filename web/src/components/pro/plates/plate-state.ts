import { t, tp } from '../../../lib/i18n';
import { unitQ } from '../../../lib/store/display-units.svelte';
import { uiStore } from '../../../lib/store/ui.svelte';
import { significantNumber } from '../../../lib/utils/unit-format';
import type { PlateEntry, PlateStatus } from '../../../lib/store/physical-plates';

/** A mesh element size as one reads it: 0.5 m, not 0.5000 m. */
export const meshSizeText = (size: number) => `${significantNumber(size, 'length', uiStore.unitSystem, 3)} ${unitQ('length')}`;

/** A plate's thickness in the section units, without trailing zeros. */
export const thicknessText = (t: number) => `${significantNumber(t, 'sectionDim', uiStore.unitSystem, 3)} ${unitQ('sectionDim')}`;

export type PlateTone = 'none' | 'raw' | 'ok' | 'warn' | 'bad';

/** What a plate's mesh is, said for a person: a mesh a mesher made, the shells it came with, none, or one to make again. */
export function plateMeshState(e: PlateEntry, status: PlateStatus): { text: string; tone: PlateTone } {
  if (status === 'invalid') return { text: t('plates.state.invalid'), tone: 'bad' };
  if (status === 'unmeshed') return { text: t('plates.state.unmeshed'), tone: 'none' };
  if (status === 'stale') return { text: t('plates.state.stale'), tone: 'warn' };
  const cells = e.surface.meshed?.cells ?? 0;
  if (e.surface.meshed?.original) return { text: cells === 1 ? t('plates.state.asModelledOne') : tp('plates.state.asModelled', { n: cells }), tone: 'raw' };
  return { text: tp('plates.state.meshed', { n: cells, size: meshSizeText(e.surface.mesh.size) }), tone: 'ok' };
}
