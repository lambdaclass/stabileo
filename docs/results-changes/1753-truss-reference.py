from decimal import Decimal as D, getcontext
import json
from fractions import Fraction as F

getcontext().prec = 70
nodes = {}
for i in range(4):
    for offset, y, z in [(1, -1, 0), (5, 1, 0), (9, -1, 2), (13, 1, 2)]:
        nodes[i + offset] = tuple(map(D, [2 * i, y, z]))
bars = []
for offset in [1, 5, 9, 13]:
    bars.extend((i + offset, i + offset + 1) for i in range(3))
for offset in [1, 5]:
    bars.extend((i + offset, i + offset + 8) for i in range(4))
for offset in [1, 5]:
    bars.extend((i + offset + 8, i + offset + 1) for i in range(3))
for offset in [1, 9]:
    bars.extend((i + offset, i + offset + 4) for i in range(4))
for a, b in [(1, 6), (5, 2), (9, 14), (13, 10)]:
    bars.extend((i + a, i + b) for i in range(3))
for i in range(4):
    bars.extend([(i + 1, i + 13), (i + 5, i + 9)])
held = {(n, axis) for n in [1, 5] for axis in range(3)} | {(4, 2), (8, 2)}
dofs = [(n, axis) for n in sorted(nodes) for axis in range(3)]
free = [d for d in dofs if d not in held]
k = {a: {b: D(0) for b in dofs} for a in dofs}
compatibility = []
for a, b in bars:
    delta = [v - u for u, v in zip(nodes[a], nodes[b])]
    length = sum(v * v for v in delta).sqrt()
    row = {(n, axis): sign * delta[axis] / length for n, sign in [(a, -1), (b, 1)] for axis in range(3)}
    compatibility.append((row, length))
    for i, u in row.items():
        for j, v in row.items():
            k[i][j] += u * v / length
load = {d: D(-10) if d in [(2, 2), (6, 2)] else D(0) for d in dofs}
a = [[k[i][j] for j in free] + [load[i]] for i in free]
for col in range(len(free)):
    pivot = max(range(col, len(free)), key=lambda i: abs(a[i][col]))
    a[col], a[pivot] = a[pivot], a[col]
    divisor = a[col][col]
    assert divisor > 0 or divisor < 0
    a[col] = [v / divisor for v in a[col]]
    for i in range(len(free)):
        if i != col:
            factor = a[i][col]
            a[i] = [u - factor * v for u, v in zip(a[i], a[col])]
u = {d: D(0) for d in dofs}
u.update({d: a[i][-1] for i, d in enumerate(free)})
residual = {i: sum(k[i][j] * u[j] for j in dofs) - load[i] for i in dofs}
assert max(abs(residual[i]) for i in free) < D("1e-50")
forces = [sum(v * u[d] for d, v in row.items()) / length for row, length in compatibility]
assert abs(sum(residual[(n, 2)] for n in nodes) - 20) < D("1e-50")
planar = {}
for name, diagonals in [("upward", [(1, 6), (7, 4), (2, 7)]), ("downward", [(5, 2), (3, 8), (6, 3)])]:
    points = [(0, 0), (4, 0), (8, 0), (12, 0), (0, 3), (4, 3), (8, 3), (12, 3)]
    members = [(1, 2), (2, 3), (3, 4), (5, 6), (6, 7), (7, 8), (1, 5), (2, 6), (3, 7), (4, 8)] + diagonals
    equations = [[F(0) for _ in range(17)] for _ in range(16)]
    for j, (a, b) in enumerate(members):
        dx, dz = [points[b - 1][i] - points[a - 1][i] for i in range(2)]
        length = 5 if dx and dz else abs(dx) or abs(dz)
        for n, sign in [(a, 1), (b, -1)]:
            equations[2 * (n - 1)][j] = F(sign * dx, length)
            equations[2 * (n - 1) + 1][j] = F(sign * dz, length)
    equations[0][13] = 1
    equations[1][14] = 1
    equations[7][15] = 1
    equations[11][16] = 30
    equations[13][16] = 30
    reduced = [row[:] for row in equations]
    for col in range(16):
        pivot = next(i for i in range(col, 16) if reduced[i][col])
        reduced[col], reduced[pivot] = reduced[pivot], reduced[col]
        divisor = reduced[col][col]
        reduced[col] = [v / divisor for v in reduced[col]]
        for i in range(16):
            if i != col:
                factor = reduced[i][col]
                reduced[i] = [x - factor * y for x, y in zip(reduced[i], reduced[col])]
    values = [row[-1] for row in reduced]
    assert all(sum(c * v for c, v in zip(row[:-1], values)) == row[-1] for row in equations)
    planar[name] = {"forces": [str(v) for v in values[:13]], "reactions": [str(v) for v in values[13:]]}
print(json.dumps({"planar": planar, "method": "70-digit Decimal axial compatibility, EA=1; joint equilibrium residual < 1e-50", "forces": [str(v) for v in forces], "reactions": {str(d): str(residual[d]) for d in sorted(held)}}, indent=2))
