import json
from decimal import Decimal, localcontext
from fractions import Fraction as F
from pathlib import Path

source = Path('engine/tests/metamorphic_corpus/nightly/issue-1088.json')
model = json.loads(source.read_text(), parse_float=F)
assert not model['constraints'] and not model['connectors']
assert model['solverOptions'] is None
assert all(s['type'] == 'fixed' and s['angle'] is None for s in model['supports'].values())

def rank(matrix):
    a = [row[:] for row in matrix]
    pivots = []
    for col in range(len(a[0])):
        pivot = next((i for i in range(len(pivots), len(a)) if a[i][col]), None)
        if pivot is None:
            continue
        row = len(pivots)
        a[row], a[pivot] = a[pivot], a[row]
        divisor = a[row][col]
        a[row] = [v / divisor for v in a[row]]
        for i in range(len(a)):
            if i != row:
                factor = a[i][col]
                a[i] = [v - factor * w for v, w in zip(a[i], a[row])]
        pivots.append(col)
    return len(pivots), pivots

def evaluate(label, release_overrides, restraint):
    ids = sorted(n['id'] for n in model['nodes'].values())
    index = {(node, d): 3 * i + d for i, node in enumerate(ids) for d in range(3)}
    size = len(index)
    parts = []
    for e in model['elements'].values():
        ni, nj = [model['nodes'][str(e[k])] for k in ['nodeI', 'nodeJ']]
        dx, dz = nj['x'] - ni['x'], nj['z'] - ni['z']
        l2 = dx * dx + dz * dz
        assert e['type'] == 'frame'
        sec = model['sections'][str(e['sectionId'])]
        mat = model['materials'][str(e['materialId'])]
        assert sec['asY'] is None
        assert mat['e'] > 0 and sec['a'] > 0 and sec['iz'] > 0
        axial = list(map(F, [-dx, -dz, 0, dx, dz, 0]))
        ends = []
        releases = release_overrides.get(e['id'], (e['hingeStart'], e['hingeEnd']))
        for end in range(2):
            v = list(map(F, [-dz, dx, 0, dz, -dx, 0]))
            v[3 * end + 2] = l2
            ends.append(v)
        local = [[sec['a'] / sec['iz'] * l2 * axial[i] * axial[j] for j in range(6)] for i in range(6)]
        if not any(releases):
            for i in range(6):
                for j in range(6):
                    local[i][j] += sum(F(4 if a == b else 2) * ends[a][i] * ends[b][j] for a in range(2) for b in range(2))
        elif not all(releases):
            v = ends[0 if releases[1] else 1]
            for i in range(6):
                for j in range(6):
                    local[i][j] += 3 * v[i] * v[j]
        glob = [[F(0) for _ in range(size)] for _ in range(size)]
        dofs = [index[(e[k], d)] for k in ['nodeI', 'nodeJ'] for d in range(3)]
        for i in range(6):
            for j in range(6):
                glob[dofs[i]][dofs[j]] += local[i][j]
        parts.append((mat['e'] * sec['iz'], l2, glob))
    restrained = {(s['nodeId'], d) for s in model['supports'].values() for d in range(3) if s['type'] == 'fixed'} | set(restraint)
    free = [i for key, i in index.items() if key not in restrained]
    scaled = [[sum(k[i][j] for _, _, k in parts) for j in free] for i in free]
    r, pivots = rank(scaled)
    active = [i for i, row in enumerate(scaled) if any(row)]
    active_matrix = [[scaled[i][j] for j in active] for i in active]
    active_rank, _ = rank(active_matrix)
    null = [F(0) for _ in range(size)]
    if label == 'original':
        a, b = model['nodes']['2'], model['nodes']['3']
        null[index[(3, 0)]] = -(b['z'] - a['z'])
        null[index[(3, 1)]] = b['x'] - a['x']
        null[index[(3, 2)]] = 1
        assert all(sum(row[j] * null[j] for j in range(size)) == 0 for _, _, k in parts for row in k)
    result = {'case': label, 'free_dofs': len(free), 'exact_rank': r, 'active_dofs': len(active), 'active_rank': active_rank}
    if label == 'original':
        result['physical_null_vector_node_3'] = [str(null[index[(3, d)]]) for d in range(3)]
        with localcontext() as ctx:
            ctx.prec = 80
            dec = lambda x: Decimal(x.numerator) / Decimal(x.denominator)
            actual = [[sum(dec(ei) / dec(l2).sqrt() ** 5 * dec(k[i][j]) for ei, l2, k in parts) for j in free] for i in free]
            residual = [sum(row[j] * dec(null[free[j]]) for j in range(len(free))) for row in actual]
            result['decimal_precision'] = ctx.prec
            result['unscaled_stiffness'] = [[str(v) for v in row] for row in actual]
            result['max_null_residual'] = str(max(map(abs, residual)))
    return result

results = [evaluate('original', {}, []), evaluate('distal_x_restrained', {}, [(3, 0)]), evaluate('distal_z_restrained', {}, [(3, 1)]), evaluate('only_first_release_removed', {1: (False, False)}, []), evaluate('only_second_release_removed', {2: (False, False)}, []), evaluate('both_releases_removed', {1: (False, False), 2: (False, False)}, [])]
assert [(r['exact_rank'], r['free_dofs']) for r in results] == [(4, 6), (4, 5), (4, 5), (5, 6), (5, 6), (6, 6)]
assert [(r['active_rank'], r['active_dofs']) for r in results] == [(4, 5), (4, 4), (4, 4), (5, 6), (5, 6), (6, 6)]
print(json.dumps(results, indent=2))
