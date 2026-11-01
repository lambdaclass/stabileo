export function displayedFields(sim: { damage(): Float64Array; displacement(): Float64Array; elementStress(): Float64Array }) {
  const stress = sim.elementStress();
  if (stress.length % 3 !== 0) throw new Error('invalid stress length');
  return {
    damage: new Float32Array(sim.damage()),
    displacement: new Float32Array(sim.displacement()),
    syy: Float32Array.from(stress.filter((_, i) => i % 3 === 1)),
  };
}
