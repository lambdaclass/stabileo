"""Result comparison shared by the differential harnesses.

Static (and P-Delta) results use the OpenSees harness's scale-aware
comparison (tools/opensees/compare.py `compare`): each quantity group is
compared as |stabileo - reference| / scale with the scale floored by the
companion group times the model size. Reference results are in the same
shape (dim, disp {node: [6]}, reac {node: [6]}, forces {elem: {nStart..}},
optional art_rot / kappa).

Modal results compare frequencies (relative error) and mode shapes. Mode
shapes are compared as subspaces: modes whose frequencies lie within
`cluster` of each other (repeated or nearly repeated eigenvalues, e.g. the
two sway modes of a doubly symmetric frame) span a subspace in which any
basis is valid, so each reference shape is projected on the span of the
stabileo shapes of its cluster and the residual |v - P v| / |v| is reported
(1 - MAC for an isolated mode, up to a square root).
"""

import math

from model import _ops_compare

static_compare = _ops_compare.compare


def _vec(shape, nodes, dofs):
    return [shape.get(n, [0.0] * 6)[k] for n in nodes for k in dofs]


def _lstsq_residual(basis, v):
    """|v - P v| / |v| for P the orthogonal projector on span(basis)."""
    q = []
    for b in basis:
        w = list(b)
        for _ in range(2):  # Gram-Schmidt, twice for stability
            for u in q:
                d = sum(x * y for x, y in zip(w, u))
                w = [x - d * y for x, y in zip(w, u)]
        n = math.sqrt(sum(x * x for x in w))
        if n > 1e-12 * max(1.0, math.sqrt(sum(x * x for x in b))):
            q.append([x / n for x in w])
    r = list(v)
    for u in q:
        d = sum(x * y for x, y in zip(r, u))
        r = [x - d * y for x, y in zip(r, u)]
    nv = math.sqrt(sum(x * x for x in v))
    return math.sqrt(sum(x * x for x in r)) / nv if nv > 0 else 0.0


def modal_compare(sres, rres, n_modes, nodes, dofs=(0, 1, 2), ftol=1e-6, stol=1e-4, cluster=1e-4):
    """(bad, groups) for the first `n_modes` modes.

    bad: [(quantity, mode, component, stabileo, reference, err)] above tolerance.
    `nodes`: the nodes whose `dofs` enter the shape vectors (translations by
    default: rotations of nodes without rotational mass are not determined
    by the eigenproblem in the same way in every program).
    """
    fs, fr = sres["freqs"], rres["freqs"]
    n = min(n_modes, len(fs), len(fr))
    bad, groups = [], {"freq": 0.0, "shape": 0.0}
    for i in range(n):
        err = abs(fs[i] - fr[i]) / max(abs(fr[i]), 1e-300)
        groups["freq"] = max(groups["freq"], err)
        if err > ftol:
            bad.append(("freq", i + 1, "f", fs[i], fr[i], err))
    for i in range(n):
        # The stabileo modes whose frequency is within the cluster of mode i.
        idx = [j for j in range(len(fs)) if abs(fs[j] - fr[i]) <= cluster * fr[i]]
        if not idx:
            continue
        if max(idx) >= len(fs) - 1 and len(fs) > n:
            continue  # the cluster may extend past the computed modes
        v = _vec(rres["shapes"][i], nodes, dofs)
        d = dofs
        full = _vec(rres["shapes"][i], nodes, range(6))
        if math.sqrt(sum(x * x for x in v)) <= 1e-8 * math.sqrt(sum(x * x for x in full)):
            # A purely rotational mode (e.g. a torsion mode of a single
            # member): its translations are round-off, compare all DOFs.
            v, d = full, range(6)
        res = _lstsq_residual([_vec(sres["shapes"][j], nodes, d) for j in idx], v)
        groups["shape"] = max(groups["shape"], res)
        if res > stol:
            bad.append(("shape", i + 1, f"cluster {[j + 1 for j in idx]}", None, None, res))
    return bad, groups
