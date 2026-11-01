const TEXT: Record<string, { es: string; pt: string }> = {
  "Bravais triangular lattices (7 shapes, 2 spring laws): periodic stiffness = Cauchy-Born": { es: 'redes triangulares de Bravais (7 formas, 2 leyes de resorte): rigidez periódica = Cauchy-Born', pt: 'redes triangulares de Bravais (7 formas, 2 leis de mola): rigidez periódica = Cauchy-Born' },
  'Bravais triangular lattices: Cauchy relation C12 = C66': { es: 'redes triangulares de Bravais: relación de Cauchy C12 = C66', pt: 'redes triangulares de Bravais: relação de Cauchy C12 = C66' },
  'Eq. (23) honeycomb, k_radial = 1e-3 (l = 0.05 ... 0.95)': { es: 'Ec. (23) panal de abeja, k_radial = 1e-3 (l = 0.05 ... 0.95)', pt: 'Eq. (23) favo de mel, k_radial = 1e-3 (l = 0.05 ... 0.95)' },
  'Eq. (23) honeycomb, k_radial = 1e-6 (l = 0.05 ... 0.95)': { es: 'Ec. (23) panal de abeja, k_radial = 1e-6 (l = 0.05 ... 0.95)', pt: 'Eq. (23) favo de mel, k_radial = 1e-6 (l = 0.05 ... 0.95)' },
  "Fig. 7 calculation line (741 points) = equal-weight Young's modulus x triangle area": { es: 'línea de cálculo de la Fig. 7 (741 puntos) = módulo de Young de pesos iguales x área del triángulo', pt: 'linha de cálculo da Fig. 7 (741 pontos) = módulo de Young de pesos iguais x área do triângulo' },
  'Fig. 9 at eta = 0: B = sqrt(3)/2, G = sqrt(3)/4': { es: 'Fig. 9 con eta = 0: B = sqrt(3)/2, G = sqrt(3)/4', pt: 'Fig. 9 com eta = 0: B = sqrt(3)/2, G = sqrt(3)/4' },
  'Supplemental Eq. (9) = periodic network with equal-weight springs (7 lattices x 37 angles)': { es: 'Ec. (9) del material suplementario = red periódica con resortes de pesos iguales (7 redes x 37 ángulos)', pt: 'Eq. (9) do material suplementar = rede periódica com molas de pesos iguais (7 redes x 37 ângulos)' },
  'dilution z = 3 (5 samples, 20 x 20): shear modulus vanishes': { es: 'dilución z = 3 (5 muestras, 20 x 20): el módulo de corte se anula', pt: 'diluição z = 3 (5 amostras, 20 x 20): o módulo de cisalhamento se anula' },
  'dilution z = 5.4 (5 samples, 20 x 20): every shear modulus at least 0.1 k': { es: 'dilución z = 5.4 (5 muestras, 20 x 20): todo módulo de corte es al menos 0.1 k', pt: 'diluição z = 5.4 (5 amostras, 20 x 20): todo módulo de cisalhamento é pelo menos 0.1 k' },
  "equilateral strip 13 x 52 (paper's protocol): finite-size bias of nu": { es: 'franja equilátera 13 x 52 (protocolo del artículo): sesgo de tamaño finito de nu', pt: 'faixa equilátera 13 x 52 (protocolo do artigo): viés de tamanho finito de nu' },
  'equilateral strips 26 x 104 and 52 x 208: Richardson extrapolation of nu = 1/3': { es: 'franjas equiláteras 26 x 104 y 52 x 208: extrapolación de Richardson de nu = 1/3', pt: 'faixas equiláteras 26 x 104 e 52 x 208: extrapolação de Richardson de nu = 1/3' },
  'foam eta = 0.3 in tension: e^T C e A equals the second difference of the relaxed nonlinear energy': { es: 'espuma eta = 0.3 en tracción: e^T C e A es igual a la segunda diferencia de la energía no lineal relajada', pt: 'espuma eta = 0.3 em tração: e^T C e A é igual à segunda diferença da energia não linear relaxada' },
  'foam eta = 0.3: e^T C e A equals the second difference of the relaxed nonlinear energy': { es: 'espuma eta = 0.3: e^T C e A es igual a la segunda diferencia de la energía no lineal relajada', pt: 'espuma eta = 0.3: e^T C e A é igual à segunda diferença da energia não linear relaxada' },
  "foam strip (eta 0.3): bond forces equal the engine's axial forces": { es: 'franja de espuma (eta 0.3): las fuerzas de los enlaces son iguales a las fuerzas axiales del motor', pt: 'faixa de espuma (eta 0.3): as forças das ligações são iguais às forças axiais do motor' },
  "foam strip (eta 0.3): displacements equal the production engine's solve_2d": { es: 'franja de espuma (eta 0.3): los desplazamientos son iguales a los de solve_2d del motor de producción', pt: 'faixa de espuma (eta 0.3): os deslocamentos são iguais aos de solve_2d do motor de produção' },
  'foam: cross-protocol comparison, periodic nu vs Fig. 5 clamped-strip error bars (eta 0 ... 0.45, 10 markers); not strip validation': { es: 'espuma: comparación entre protocolos, nu periódico frente a las barras de error de la franja empotrada de la Fig. 5 (eta 0 ... 0.45, 10 marcadores); no valida la franja', pt: 'espuma: comparação entre protocolos, nu periódico versus as barras de erro da faixa engastada da Fig. 5 (eta 0 ... 0.45, 10 marcadores); não valida a faixa' },
  'foam: periodic ensemble regression at eta = 0.5 (10 seeds, recorded mean -0.147608233, sd 0.017861567)': { es: 'espuma: regresión del conjunto periódico con eta = 0.5 (10 semillas, media registrada -0.147608233, desvío 0.017861567)', pt: 'espuma: regressão do conjunto periódico com eta = 0.5 (10 sementes, média registrada -0.147608233, desvio 0.017861567)' },
  'foam: periodic zero crossing vs strip text eta = 0.46 (cross-protocol)': { es: 'espuma: cruce por cero periódico frente al eta = 0.46 del texto para la franja (entre protocolos)', pt: 'espuma: cruzamento por zero periódico versus o eta = 0.46 do texto para a faixa (entre protocolos)' },
  'frame invariance: C of the rotated foam is C rotated': { es: 'invariancia de marco: C de la espuma rotada es C rotada', pt: 'invariância de referencial: C da espuma girada é C girada' },
  'lattice (1, 0.5), theta = 0, equal Hookean springs: exact nu = 1/6': { es: 'red (1, 0.5), theta = 0, resortes de Hooke iguales: nu exacto = 1/6', pt: 'rede (1, 0.5), theta = 0, molas de Hooke iguais: nu exato = 1/6' },
  'lattice (1, 0.5), theta = 0: Supplemental Eq. (9) evaluates to 8/27': { es: 'red (1, 0.5), theta = 0: la Ec. (9) del material suplementario da 8/27', pt: 'rede (1, 0.5), theta = 0: a Eq. (9) do material suplementar dá 8/27' },
  'square lattice under tension t: C33 = 2 t (stress stiffening)': { es: 'red cuadrada bajo tracción t: C33 = 2 t (rigidización por tensión)', pt: 'rede quadrada sob tração t: C33 = 2 t (enrijecimento por tensão)' },
  'square lattice: C11 = C22 = k, C12 = 0': { es: 'red cuadrada: C11 = C22 = k, C12 = 0', pt: 'rede quadrada: C11 = C22 = k, C12 = 0' },
  'square lattice: zero shear modulus (floppy)': { es: 'red cuadrada: módulo de corte nulo (blanda)', pt: 'rede quadrada: módulo de cisalhamento nulo (frouxa)' },
  "triangular lattice: Poisson's ratio = 1/3": { es: 'red triangular: coeficiente de Poisson = 1/3', pt: 'rede triangular: coeficiente de Poisson = 1/3' },
  'triangular lattice: bulk modulus = sqrt(3)/2 k': { es: 'red triangular: módulo volumétrico = sqrt(3)/2 k', pt: 'rede triangular: módulo volumétrico = sqrt(3)/2 k' },
  'triangular lattice: isotropic': { es: 'red triangular: isótropa', pt: 'rede triangular: isotrópica' },
  'triangular lattice: no nonaffine displacement': { es: 'red triangular: sin desplazamiento no afín', pt: 'rede triangular: sem deslocamento não afim' },
  'triangular lattice: shear modulus = sqrt(3)/4 k': { es: 'red triangular: módulo de corte = sqrt(3)/4 k', pt: 'rede triangular: módulo de cisalhamento = sqrt(3)/4 k' },
  'absolute difference': { es: 'diferencia absoluta', pt: 'diferença absoluta' },
  'markers outside': { es: 'marcadores fuera', pt: 'marcadores fora' },
  'max G / k': { es: 'máx G / k', pt: 'máx G / k' },
  'max absolute difference': { es: 'máx diferencia absoluta', pt: 'máx diferença absoluta' },
  'max difference': { es: 'máx diferencia', pt: 'máx diferença' },
  'max relative difference': { es: 'máx diferencia relativa', pt: 'máx diferença relativa' },
  'max |C - C_iso| / (B + G)': { es: 'máx |C - C_iso| / (B + G)', pt: 'máx |C - C_iso| / (B + G)' },
  'max |Y difference|': { es: 'máx |diferencia de Y|', pt: 'máx |diferença de Y|' },
  'max |dN| / max |N|': { es: 'máx |dN| / máx |N|', pt: 'máx |dN| / máx |N|' },
  'max |du| / max |u|': { es: 'máx |du| / máx |u|', pt: 'máx |du| / máx |u|' },
  'max |nu difference|': { es: 'máx |diferencia de nu|', pt: 'máx |diferença de nu|' },
  'max(0, 0.1 - min G / k)': { es: 'máx(0, 0.1 - mín G / k)', pt: 'máx(0, 0.1 - mín G / k)' },
  nonaffinity: { es: 'no afinidad', pt: 'não afinidade' },
  'nu - 1/3': { es: 'nu - 1/3', pt: 'nu - 1/3' },
  'relative difference': { es: 'diferencia relativa', pt: 'diferença relativa' },
  '|C33|': { es: '|C33|', pt: '|C33|' },
  '|eta_0 - 0.46|': { es: '|eta_0 - 0.46|', pt: '|eta_0 - 0.46|' },
  '|mean nu - recorded mean|': { es: '|media de nu - media registrada|', pt: '|média de nu - média registrada|' },
};

export function hasCheckText(text: string): boolean {
  return text in TEXT;
}

/** A VALIDATION.json check name or metric in the page language. */
export function checkText(text: string, locale: string): string {
  return TEXT[text]?.[locale as 'es' | 'pt'] ?? text;
}
