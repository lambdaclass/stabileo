type Values = ArrayLike<number> & Iterable<number>;
type Material = { e: number; nu: number; plane: string };
type Snapshots = { damage: Record<number, number[]>; displacement: Record<number, number[]> };
export function maxDifference(a: Values, b: Values): number;
export function mirrorMap(nodes: Values): number[];
export function expectedStress(nodes: Values, elements: Values, damage: Values, displacement: Values, material: Material): number[];
export function checkFields(frame: { step: { step: number; damage_max: number }; damage: Values; displacement: Values; syy?: Values }, nodes: Values, elements: Values, snapshots: Snapshots, material: Material, replay?: boolean): string[];
