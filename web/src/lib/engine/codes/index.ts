// Design code registry — provides a unified interface for all supported codes

import * as argentina from './argentina';
import * as us from './us';
import * as eu from './eu';
import * as timber from './timber';
import * as masonry from './masonry';
import * as cfs from './cfs';

export { argentina, us, eu, timber, masonry, cfs };

export type DesignCodeId = 'cirsoc' | 'aci-aisc' | 'eurocode' | 'nds' | 'masonry' | 'cfs';

export interface DesignCodeInfo {
  id: DesignCodeId;
  label: string;
  isAvailable: () => boolean;
  /** What check categories this code supports */
  capabilities: DesignCodeCapability[];
}

export type DesignCodeCapability = 'rc' | 'steel' | 'timber' | 'masonry' | 'cfs' | 'seismic' | 'serviceability';

export const DESIGN_CODES: DesignCodeInfo[] = [
  {
    id: 'cirsoc',
    label: 'CIRSOC 201/301',
    isAvailable: () => true, // JS implementation always available
    capabilities: ['rc', 'steel', 'seismic', 'serviceability'],
  },
  {
    id: 'aci-aisc',
    label: 'ACI 318 / AISC 360',
    isAvailable: us.isAvailable,
    capabilities: ['rc', 'steel'],
  },
  {
    id: 'eurocode',
    label: 'Eurocode 2/3',
    isAvailable: eu.isAvailable,
    capabilities: ['rc', 'steel'],
  },
  {
    id: 'nds',
    label: 'NDS (Timber)',
    isAvailable: timber.isAvailable,
    capabilities: ['timber'],
  },
  {
    id: 'masonry',
    label: 'TMS 402 (Masonry)',
    isAvailable: masonry.isAvailable,
    capabilities: ['masonry'],
  },
  {
    id: 'cfs',
    label: 'AISI S100 (CFS)',
    isAvailable: cfs.isAvailable,
    capabilities: ['cfs'],
  },
];

/** Get codes that support a specific capability */
export function getCodesForCapability(cap: DesignCodeCapability): DesignCodeInfo[] {
  return DESIGN_CODES.filter(c => c.capabilities.includes(cap));
}
