import d56 from '../../../../../research/fracture/shauer-2025/reference-results/ex2_damage_step056.csv?raw';
import d57 from '../../../../../research/fracture/shauer-2025/reference-results/ex2_damage_step057.csv?raw';
import d78 from '../../../../../research/fracture/shauer-2025/reference-results/ex2_damage_step078.csv?raw';
import u56 from '../../../../../research/fracture/shauer-2025/reference-results/ex2_displacement_step056.csv?raw';
const values = (s: string) => s.trim().split(/\r?\n/).slice(1).flatMap(row => row.split(',').map(Number));
export const snapshots = { damage: { 56: values(d56), 57: values(d57), 78: values(d78) }, displacement: { 56: values(u56) } };
