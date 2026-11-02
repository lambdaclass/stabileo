const PHRASES: Record<string, { es: string; pt: string }> = {
  'mesh identical to the reference (node and element fingerprints)': { es: 'malla idéntica a la de referencia (huellas de nodos y elementos)', pt: 'malha idêntica à de referência (impressões de nós e elementos)' },
  'same number of load steps': { es: 'mismo número de pasos de carga', pt: 'mesmo número de passos de carga' },
  'same number of staggered iterations at every step': { es: 'mismo número de iteraciones escalonadas en cada paso', pt: 'mesmo número de iterações escalonadas em cada passo' },
  'maximum damage at every step': { es: 'daño máximo en cada paso', pt: 'dano máximo em cada passo' },
  'maximum damage at every step up to the peak': { es: 'daño máximo en cada paso hasta el pico', pt: 'dano máximo em cada passo até o pico' },
  'stress at the bar centre at every step': { es: 'tensión en el centro de la barra en cada paso', pt: 'tensão no centro da barra em cada passo' },
  'nodal damage at step 50': { es: 'daño nodal en el paso 50', pt: 'dano nodal no passo 50' },
  'nodal damage at step 73': { es: 'daño nodal en el paso 73', pt: 'dano nodal no passo 73' },
  'nodal displacement at step 50': { es: 'desplazamiento nodal en el paso 50', pt: 'deslocamento nodal no passo 50' },
  'centre stress vs 1D AT2 homogeneous solution while max damage < 0.25': { es: 'tensión central frente a la solución homogénea AT2 1D mientras el daño máximo < 0.25', pt: 'tensão central versus a solução homogênea AT2 1D enquanto o dano máximo < 0.25' },
  'peak force': { es: 'fuerza pico', pt: 'força de pico' },
  'peak force at the same load step': { es: 'fuerza pico en el mismo paso de carga', pt: 'força de pico no mesmo passo de carga' },
  'force at every step up to the peak': { es: 'fuerza en cada paso hasta el pico', pt: 'força em cada passo até o pico' },
  'force at every step, including fracture (comparison tolerance)': { es: 'fuerza en cada paso, incluida la fractura (tolerancia de comparación)', pt: 'força em cada passo, incluindo a fratura (tolerância de comparação)' },
  'nodal damage at the peak step 56': { es: 'daño nodal en el paso pico 56', pt: 'dano nodal no passo de pico 56' },
  'nodal displacement at the peak step 56': { es: 'desplazamiento nodal en el paso pico 56', pt: 'deslocamento nodal no passo de pico 56' },
  'nodal damage at step 57, reference or its mirror image': { es: 'daño nodal en el paso 57, la referencia o su imagen especular', pt: 'dano nodal no passo 57, a referência ou sua imagem espelhada' },
  'nodal damage at step 78, reference or its mirror image': { es: 'daño nodal en el paso 78, la referencia o su imagen especular', pt: 'dano nodal no passo 78, a referência ou sua imagem espelhada' },
  'nodal damage at the last step 98, reference or its mirror image': { es: 'daño nodal en el último paso 98, la referencia o su imagen especular', pt: 'dano nodal no último passo 98, a referência ou sua imagem espelhada' },
};

export function hasCheckName(name: string): boolean {
  return name.replace(/^ex\d+: /, '') in PHRASES;
}

/** A VALIDATION.json check name in the page language; the `exN:` example prefix is kept. */
export function checkName(name: string, locale: string): string {
  const [, prefix = '', phrase] = name.match(/^(ex\d+: )?(.*)$/s)!;
  const own = PHRASES[phrase]?.[locale as 'es' | 'pt'];
  return own ? `${prefix}${own}` : name;
}
