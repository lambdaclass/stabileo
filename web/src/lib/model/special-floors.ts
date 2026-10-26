/**
 * What the project states about its special slabs and foundations: the system of each special
 * slab panel (rib geometry, plank type, deck profile, span direction), the plank types and deck
 * profiles it uses (as their makers declare them), the drop panels and capitals at the columns,
 * and the longitudinal steel of its piles. Read by `store/special-floors.ts`.
 */
import type { RibbedGeometry } from '../engine/design/slabs/ribbed';
import type { DeckProfile, PlankType } from '../engine/design/slabs/precast-floors';
import type { DropPanel } from '../engine/design/slabs/drop-panels';

export interface SlabSystemChoice { ribbed?: RibbedGeometry; plankId?: string; deckId?: string; direction?: 'x' | 'y' }
export interface HeadChoice { drop?: DropPanel; capital?: number }
export interface SpecialFloorsData {
  systems?: Record<string, SlabSystemChoice>;
  plankTypes?: Array<PlankType & { id: string }>;
  deckProfiles?: Array<DeckProfile & { id: string }>;
  heads?: Record<string, HeadChoice>;
  /** Longitudinal steel of the piles as a share of their section, for the section check. */
  pileSteelRatio?: number;
}
