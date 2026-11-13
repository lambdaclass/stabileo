import json
from decimal import Decimal, localcontext
from fractions import Fraction as F
from pathlib import Path

source = Path("engine/tests/fixtures/truss-balance-1969.json")
model = json.loads(source.read_text(), parse_float=lambda x: F(float(x)))["nodal-1969"]
size = 3 * len(model["nodes"])
assert not model["constraints"] and not model["connectors"]
assert all(s["type"] == "fixed" for s in model["supports"].values())
restrained = {3 * (s["nodeId"] - 1) + d for s in model["supports"].values() for d in range(3)}
parts = []
compatibility = []
for e in model["elements"].values():
    a, b = [model["nodes"][str(e[k])] for k in ["nodeI", "nodeJ"]]
    dx, dz = b["x"] - a["x"], b["z"] - a["z"]
    l2 = dx * dx + dz * dz
    sec = model["sections"][str(e["sectionId"])]
    mat = model["materials"][str(e["materialId"])]
    assert mat["e"] > 0 and sec["a"] > 0 and sec["iz"] > 0
    assert sec.get("asY") is None
    assert not e["hingeStart"] and not e["hingeEnd"]
    dofs = [3 * (e[k] - 1) + d for k in ["nodeI", "nodeJ"] for d in range(3)]
    axial = list(map(F, [-dx, -dz, 0, dx, dz, 0]))
    vectors = [axial]
    if e["type"] == "frame":
        for end in range(2):
            v = list(map(F, [-dz, dx, 0, dz, -dx, 0]))
            v[3 * end + 2] = l2
            vectors.append(v)
    else:
        assert e["type"] == "truss"
    for v in vectors:
        row = [F(0)] * size
        for i, d in enumerate(dofs):
            row[d] = v[i]
        compatibility.append(row)
    local = [[sec["a"] * l2 * axial[i] * axial[j] for j in range(6)] for i in range(6)]
    if len(vectors) == 3:
        for i in range(6):
            for j in range(6):
                local[i][j] += sec["iz"] * sum(F(4 if a == b else 2) * vectors[a + 1][i] * vectors[b + 1][j] for a in range(2) for b in range(2))
    parts.append((mat["e"] * 1000, l2, dofs, local))

def rank(rows):
    a = [r[:] for r in rows]
    r = 0
    for col in range(len(a[0])):
        pivot = next((i for i in range(r, len(a)) if a[i][col]), None)
        if pivot is None:
            continue
        a[r], a[pivot] = a[pivot], a[r]
        divisor = a[r][col]
        a[r] = [v / divisor for v in a[r]]
        for i in range(r + 1, len(a)):
            factor = a[i][col]
            a[i] = [v - factor * w for v, w in zip(a[i], a[r])]
        r += 1
    return r

def solve(a, b):
    a = [row[:] + [v] for row, v in zip(a, b)]
    n = len(b)
    for col in range(n):
        pivot = max(range(col, n), key=lambda i: abs(a[i][col]))
        a[col], a[pivot] = a[pivot], a[col]
        divisor = a[col][col]
        assert divisor
        a[col] = [v / divisor for v in a[col]]
        for i in range(n):
            if i != col:
                factor = a[i][col]
                a[i] = [v - factor * w for v, w in zip(a[i], a[col])]
    return [row[-1] for row in a]

def evaluate(slave, precision):
    held = restrained | ({3 * (slave - 1)} if slave else set())
    free = [d for d in range(size) if d not in held]
    active = [d for d in free if any(row[d] for row in compatibility)]
    exact_rank = rank([[row[d] for d in free] for row in compatibility])
    assert exact_rank == len(active)
    assert [d for d in free if d not in active] == [3 * (n - 1) + 2 for n in [5, 7]]
    with localcontext() as ctx:
        ctx.prec = precision
        dec = lambda x: Decimal(x.numerator) / Decimal(x.denominator) if isinstance(x, F) else Decimal(x)
        k = [[Decimal(0) for _ in range(size)] for _ in range(size)]
        for e, l2, dofs, local in parts:
            scale = dec(e) / dec(l2).sqrt() ** 5
            for i, di in enumerate(dofs):
                for j, dj in enumerate(dofs):
                    k[di][dj] += scale * dec(local[i][j])
        f = [Decimal(0)] * size
        for load in model["loads"]:
            assert load["type"] == "nodal"
            data = load["data"]
            for d, field in enumerate(["fx", "fz", "my"]):
                f[3 * (data["nodeId"] - 1) + d] += dec(data[field])
        a = [[k[i][j] for j in active] for i in active]
        rhs = [f[i] for i in active]
        u = [Decimal(0)] * size
        for d, v in zip(active, solve(a, rhs)):
            u[d] = v
        residual = max(abs(sum(k[i][j] * u[j] for j in range(size)) - f[i]) for i in active)
        diag = [a[i][i].sqrt() for i in range(len(active))]
        scaled = [[v / (diag[i] * diag[j]) for j, v in enumerate(row)] for i, row in enumerate(a)]
        inverse_cols = [solve(scaled, [Decimal(i == j) for i in range(len(active))]) for j in range(len(active))]
        norm = max(sum(map(abs, row)) for row in scaled)
        inverse_norm = max(sum(abs(col[i]) for col in inverse_cols) for i in range(len(active)))
        return {"slave": slave, "free_dofs": len(free), "exact_rank": exact_rank, "active_dofs": len(active), "precision": precision, "scaled_condition_inf": str(norm * inverse_norm), "max_free_residual": str(residual), "displacements": [[str(u[3 * n + d]) for d in range(3)] for n in range(len(model["nodes"]))]}

results = []
for slave in [None, 2, 3]:
    low, high = evaluate(slave, 80), evaluate(slave, 110)
    assert max(abs(Decimal(a) - Decimal(b)) for ra, rb in zip(low["displacements"], high["displacements"]) for a, b in zip(ra, rb)) < Decimal("1e-60")
    assert Decimal(high["max_free_residual"]) < Decimal("1e-90")
    results.append(high)
assert results[0]["displacements"] == results[2]["displacements"]
print(json.dumps(results, indent=2))
