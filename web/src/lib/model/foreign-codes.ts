/**
 * The codes the project designs to besides CIRSOC, by material, in the design data. CIRSOC stays
 * the default; a foreign code designs the same members with its own rules (`store/foreign-design.ts`).
 */
export type ConcreteCodeChoice = 'cirsoc' | 'aci318' | 'ec2' | 'ec2-uk';
export type SteelCodeChoice = 'cirsoc' | 'aisc360' | 'ec3' | 'ec3-uk';
export interface ForeignCodes { concrete?: ConcreteCodeChoice; steel?: SteelCodeChoice }
