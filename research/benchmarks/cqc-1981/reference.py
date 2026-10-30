import json
import math
from pathlib import Path

case = json.loads((Path(__file__).parents[3] / 'engine/tests/benchmarks/cqc_1981.json').read_text())
a, b, d, mass = 1020.0, -20.0, 1230.0, 10.0
roots = [(a + d + sign * math.hypot(a - d, 2 * b)) / (2 * mass) for sign in [-1, 1]]
omega = [math.sqrt(root) for root in roots]
forces, shapes = [], []
for root in roots:
    vector = [1.0, (mass * root - a) / b]
    norm = math.sqrt(mass * sum(v * v for v in vector))
    vector = [v / norm for v in vector]
    gamma = mass * sum(vector)
    forces.append(gamma * gamma)
    shapes.append([v * gamma / root for v in vector])
r, xi = omega[1] / omega[0], case['xi']
rho = 8 * xi**2 * (1 + r) * r**1.5 / ((1 - r*r)**2 + 4 * xi**2 * r * (1 + r)**2)
def combine(values, correlation):
    return math.sqrt(sum(v*v for v in values) + 2 * correlation * values[0] * values[1])
reference = dict(frequencies=[w / (2 * math.pi) for w in omega], rho=rho, modalBaseShear=forces,
                 SRSS=combine(forces, 0), CQC=combine(forces, rho),
                 roofSRSS=[combine([s[i] for s in shapes], 0) for i in range(2)],
                 roofCQC=[combine([s[i] for s in shapes], rho) for i in range(2)])
for key, value in reference.items():
    expected = case['reference'][key]
    for actual, wanted in zip(value if isinstance(value, list) else [value], expected if isinstance(expected, list) else [expected]):
        assert math.isclose(actual, wanted, rel_tol=1e-12)
print(json.dumps(reference, indent=2))
