const examples = [
  {
    "dia": 16,
    "Mu": 30,
    "a": 0.03973929907223231,
    "c": 0.04675211655556742,
    "phi": 0.9,
    "phiMn": 51.55,
    "epsilonT": 0.020036390207487764,
    "epsilonTMin": 0.0051
  },
  {
    "dia": 20,
    "Mu": 60,
    "a": 0.06209265480036296,
    "c": 0.07305018211807407,
    "phi": 0.9,
    "phiMn": 77.42,
    "epsilonT": 0.011661154413946535,
    "epsilonTMin": 0.0051
  },
  {
    "dia": 25,
    "Mu": 90,
    "a": 0.09701977312556713,
    "c": 0.11414090955949074,
    "phi": 0.9,
    "phiMn": 113.55,
    "epsilonT": 0.006317430569849271,
    "epsilonTMin": 0.0051
  },
  {
    "dia": 32,
    "Mu": 120,
    "a": 0.15895719628892924,
    "c": 0.1870084662222697,
    "phi": 0.6942300930146359,
    "phiMn": 127.34,
    "epsilonT": 0.0026307611161756304,
    "epsilonTMin": 0.0051
  }
] as const;

const formatted = (value: number, digits: number, point: '.' | ',') => value.toFixed(digits).replace('.', point);

export function flexureExampleRows(passes: string, refuses: string, point: '.' | ',' = ','): string[][] {
  const decimal = (value: number, digits: number) => formatted(value, digits, point);
  return examples.map(v => [String(v.Mu), `2 Ø${v.dia}`, decimal(v.epsilonT * 1000, 2), decimal(v.phi, 3), decimal(v.phiMn, 2), v.epsilonT >= v.epsilonTMin ? passes : refuses]);
}

const effectiveDepthMm = (diameter: number) => 400 - 25 - 8 - diameter / 2;

export function minimumSteelExampleRows(minimum: string, strength: string, point: '.' | ','): string[][] {
  const depth = effectiveDepthMm(20);
  const width = 200;
  const fy = 420;
  const fc = 25;
  const blockStress = 0.85 * fc;
  const minimumArea = Math.max(0.25 * Math.sqrt(fc), 1.4) / fy * width * depth;
  return [15, 30, 60, 90].map(moment => {
    const blockDepth = depth - Math.sqrt(depth ** 2 - 2 * moment * 1e6 / (0.9 * blockStress * width));
    const requiredArea = blockStress * width * blockDepth / fy;
    return [String(moment), formatted(requiredArea / 100, 2, point), formatted(minimumArea / 100, 2, point), requiredArea < minimumArea ? minimum : strength];
  });
}

export function flexureExampleSteps(reinforcement: string, point: '.' | ',' = ','): string[] {
  const decimal = (value: number, digits: number) => formatted(value, digits, point);
  const bar = examples.find(v => v.dia === 20)!;
  const depth = effectiveDepthMm(bar.dia);
  const area = 2 * Math.PI * (bar.dia / 10) ** 2 / 4;
  return [
    `d = 400 − 25 − 8 − ${bar.dia}/2 = ${depth} mm = ${decimal(depth / 10, 1)} cm`,
    `Mu = ${decimal(bar.Mu, 2)} kN·m`,
    `As = 2·π·(${bar.dia} mm)²/4 = ${decimal(area, 2)} cm²`,
    'h = 400 mm; c_nom = 25 mm; Øw = 8 mm',
    `εt,min (CIRSOC 201-2025) = ${decimal(bar.epsilonTMin * 1000, 2)}‰`,
    reinforcement,
    `a = ${decimal(bar.a * 100, 2)} cm, c = ${decimal(bar.c * 100, 2)} cm`,
    `εt = ${decimal(bar.epsilonT * 1000, 2)}‰`,
    `εt ≥ εt,min → φ = ${decimal(bar.phi, 2)}`,
    `φMn = ${decimal(bar.phiMn, 2)} kN·m`,
  ];
}
