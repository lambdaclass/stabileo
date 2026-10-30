"""Independent references for research_benchmarks::mattiasson_* (#845).

Offline generator, not a CI dependency; no engine imports or engine output.
Run in a scratch venv with mpmath==1.4.1, numpy==2.5.4, scipy==1.18.1 installed:
    python engine/tests/research_references/elastica.py
See ../BENCHMARK_REFERENCES.md for the derivation and source attribution.
"""
import mpmath as mp
import numpy as np
from scipy.integrate import solve_bvp


def inextensible(q, digits):
    with mp.workdps(digits):
        def integrals(alpha):
            m = (1 + mp.sin(alpha)) / 2
            phi = mp.asin(1 / mp.sqrt(2 * m))
            return (mp.ellipk(m) - mp.ellipf(phi, m),
                    mp.ellipe(m) - mp.ellipe(phi, m))

        lo, hi = mp.mpf(0), mp.pi / 2 - mp.mpf("1e-20")
        for _ in range(4 * digits):
            alpha = (lo + hi) / 2
            if integrals(alpha)[0] < mp.sqrt(q):
                lo = alpha
            else:
                hi = alpha
        alpha = (lo + hi) / 2
        return (1 - mp.sqrt(2 * mp.sin(alpha) / q),
                1 - 2 * integrals(alpha)[1] / mp.sqrt(q))


def extensible(q, area, tolerance):
    # t=s0/L, theta positive downwards, eta=P/EA=q*I/(A*L²).
    eta = q * 1e-4 / (area * 4)

    def ode(t, state):
        theta, curvature = state[:2]
        stretch = 1 + eta * np.sin(theta)
        return np.array([curvature, -q * stretch * np.cos(theta),
                         stretch * np.cos(theta), stretch * np.sin(theta)])

    def boundary(root, tip):
        return np.array([root[0], tip[1], root[2], root[3]])

    t = np.linspace(0, 1, 201)
    guess = np.array([1.4 * t, 1.4 * (1 - t), t, t / 2])
    result = solve_bvp(ode, boundary, t, guess, tol=tolerance, max_nodes=20000)
    assert result.success, result.message
    return np.array([1 - result.y[2, -1], result.y[3, -1]])


if __name__ == "__main__":
    for q in [1, 2, 5, 10]:
        exact = inextensible(q, 60)
        higher_precision = inextensible(q, 80)
        with mp.workdps(80):
            assert max(abs(a - b) for a, b in zip(exact, higher_precision)) < mp.mpf("1e-55")
        print(q, "inextensible:", *(mp.nstr(v, 30) for v in exact))
        # A=infinity independently cross-checks elliptic integrals via the ODE.
        assert np.max(np.abs(extensible(q, np.inf, 1e-11) - np.array(exact, dtype=float))) < 1e-11
        for area in [.01, 1.]:
            value = extensible(q, area, 1e-11)
            assert np.max(np.abs(value - extensible(q, area, 1e-10))) < 1e-11
            print(q, f"A={area}:", *(f"{v:.15f}" for v in value))
