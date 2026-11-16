from decimal import Decimal as D, localcontext
import json
from pathlib import Path


def integral_product(a, b, length):
    return length * sum((x * y / D(i + j + 1) for i, x in enumerate(a) for j, y in enumerate(b)), D(0))


def derivative(p, length):
    return [D(i) * p[i] / length for i in range(1, len(p))]


def solve(a, b):
    a = [row[:] + [rhs] for row, rhs in zip(a, b)]
    for col in range(len(b)):
        pivot = max(range(col, len(b)), key=lambda row: abs(a[row][col]))
        a[col], a[pivot] = a[pivot], a[col]
        for row in range(col + 1, len(b)):
            ratio = a[row][col] / a[col][col]
            for j in range(col + 1, len(b) + 1):
                a[row][j] -= ratio * a[col][j]
            a[row][col] = D(0)
    x = [D(0)] * len(b)
    for row in reversed(range(len(b))):
        x[row] = (a[row][-1] - sum((a[row][j] * x[j] for j in range(row + 1, len(b))), D(0))) / a[row][row]
    return x


def reference(precision, input_model=None, audit_displacements=None, iteration_tolerance=D('1e-12')):
    with localcontext() as context:
        context.prec = precision
        s = input_model if input_model is not None else json.loads(Path('engine/tests/fixtures/candidate-replay.json').read_text(), parse_float=D)['1901-body-0']
        assert not s['constraints'] and not s['connectors']
        assert all(not e['hingeStart'] and not e['hingeEnd'] for e in s['elements'].values())
        assert all(section.get('asY') is None for section in s['sections'].values())
        assert all(support['type'] in ['fixed', 'pinned'] for support in s['supports'].values())
        nodes = sorted(s['nodes'].values(), key=lambda n: n['id'])
        index = {n['id']: i * 3 for i, n in enumerate(nodes)}
        n = 3 * len(nodes)
        k = [[D(0)] * n for _ in range(n)]
        f = [D(0)] * n
        members = {}
        for e in s['elements'].values():
            a, b = [s['nodes'][str(e[key])] for key in ['nodeI', 'nodeJ']]
            dx, dz = b['x'] - a['x'], b['z'] - a['z']
            length = (dx * dx + dz * dz).sqrt()
            c, t = dx / length, dz / length
            transform = [[D(0)] * n for _ in range(6)]
            for end, node in enumerate([a, b]):
                j = index[node['id']]
                transform[3 * end][j:j + 2] = [c, t]
                transform[3 * end + 1][j:j + 2] = [-t, c]
                transform[3 * end + 2][j + 2] = D(1)
            axial = [[-1 / length], [], [], [1 / length], [], []]
            if e['type'] == 'frame':
                shapes = [[], [D(1), D(0), D(-3), D(2)], [D(0), length, -2 * length, length], [], [D(0), D(0), D(3), D(-2)], [D(0), D(0), -length, length]]
            else:
                shapes = [[], [D(1), D(-1)], [], [], [D(0), D(1)], []]
            slopes = [derivative(p, length) for p in shapes]
            curvature = [derivative(p, length) for p in slopes]
            material = s['materials'][str(e['materialId'])]
            section = s['sections'][str(e['sectionId'])]
            ea, ei = material['e'] * D(1000) * section['a'], material['e'] * D(1000) * section['iz']
            elastic = [[ea * integral_product(axial[i], axial[j], length) + ei * integral_product(curvature[i], curvature[j], length) for j in range(6)] for i in range(6)]
            geom = [[integral_product(slopes[i], slopes[j], length) for j in range(6)] for i in range(6)]
            def assemble(local, target):
                for i in range(n):
                    for j in range(n):
                        target[i][j] += sum((transform[a][i] * local[a][b] * transform[b][j] for a in range(6) for b in range(6) if transform[a][i] and transform[b][j]), D(0))
            assemble(elastic, k)
            members[e['id']] = (length, ea, transform, axial, shapes, geom)
        for load in s['loads']:
            data = load['data']
            length, ea, transform, axial, shapes, geom = members[data['elementId']]
            if load['type'] == 'distributed':
                assert data['a'] is None and data['b'] is None
                q = [data['qI'], data['qJ'] - data['qI']]
                local = [integral_product(p, q, length) for p in shapes]
            else:
                assert load['type'] == 'pointOnElement'
                assert data['px'] is None and data['my'] is None
                xi = data['a'] / length
                local = [data['p'] * sum((v * xi ** i for i, v in enumerate(p)), D(0)) for p in shapes]
            for j in range(n):
                f[j] += sum((transform[i][j] * local[i] for i in range(6)), D(0))
        restrained = set()
        for support in s['supports'].values():
            j = index[support['nodeId']]
            restrained.update(range(j, j + (3 if support['type'] == 'fixed' else 2)))
        free = [i for i in range(n) if i not in restrained and any(k[i])]
        def full_solve(matrix):
            solution = solve([[matrix[i][j] for j in free] for i in free], [f[i] for i in free])
            result = [D(0)] * n
            for i, v in zip(free, solution):
                result[i] = v
            return result
        def tangent_at(u):
            tangent = [row[:] for row in k]
            for length, ea, transform, axial, shapes, geom in members.values():
                local_u = [sum((t * v for t, v in zip(row, u)), D(0)) for row in transform]
                force = ea * (local_u[3] - local_u[0]) / length
                for i in range(n):
                    for j in range(n):
                        tangent[i][j] += force * sum((transform[a][i] * geom[a][b] * transform[b][j] for a in range(6) for b in range(6) if transform[a][i] and transform[b][j]), D(0))
            return tangent
        linear = full_solve(k)
        u = linear[:]
        converged = False
        for iteration in range(100):
            v = full_solve(tangent_at(u))
            norm = sum((v[i] ** 2 for i in free), D(0)).sqrt()
            diff = sum(((v[i] - u[i]) ** 2 for i in free), D(0)).sqrt()
            u = v
            relative = diff / norm
            if relative < iteration_tolerance:
                converged = True
                break
        if audit_displacements is not None:
            assert len(audit_displacements) == len(nodes)
            assert {d['nodeId'] for d in audit_displacements} == set(index)
            assert all(D(d[field]).is_finite() for d in audit_displacements for field in ['ux', 'uz', 'ry'])
            evaluated = [D(0)] * n
            for d in audit_displacements:
                for j, field in enumerate(['ux', 'uz', 'ry']):
                    evaluated[index[d['nodeId']] + j] = D(d[field])
            tangent = tangent_at(evaluated)
            residual = [sum((tangent[i][j] * evaluated[j] for j in range(n)), D(0)) - f[i] for i in range(n)]
            center = [sum((node[field] for node in nodes), D(0)) / len(nodes) for field in ['x', 'z']]
            length = max(sum(((node[field] - center[j]) ** 2 for j, field in enumerate(['x', 'z'])), D(0)).sqrt() for node in nodes)
            def dual_norm(values):
                return sum(((values[i] / (length if i % 3 == 2 else D(1))) ** 2 for i in free), D(0)).sqrt()
            relative_residual = dual_norm(residual) / dual_norm(f)
            error = max(abs(evaluated[i] - u[i]) / max(D(1), abs(u[i])) for i in free)
            return {'relativeResidual': str(relative_residual), 'relativeDisplacementError': str(error)}
        return {'precision': precision, 'linear': [{'nodeId': node['id'], **{name: str(linear[index[node['id']] + j]) for j, name in enumerate(['ux', 'uz', 'ry'])}} for node in nodes], 'pdelta': {'iterations': iteration + 1, 'converged': converged, 'relativeUpdate': str(relative), 'displacements': [{'nodeId': node['id'], **{name: str(u[index[node['id']] + j]) for j, name in enumerate(['ux', 'uz', 'ry'])}} for node in nodes]}}


if __name__ == '__main__':
    references = [reference(p) for p in [60, 100]]
    for key in ['linear', 'pdelta']:
        answers = [r[key] if key == 'linear' else r[key]['displacements'] for r in references]
        for a, b in zip(*answers):
            assert a['nodeId'] == b['nodeId']
            for field in ['ux', 'uz', 'ry']:
                assert abs(D(a[field]) - D(b[field])) <= D('1e-45') * max(D(1), abs(D(b[field])))
    assert all(r['pdelta']['converged'] for r in references)
    print(json.dumps(references, indent=2))
