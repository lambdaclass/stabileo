#!/usr/bin/env python3
"""
Rigid-block limit analysis of a circular masonry arch (2D), numpy/scipy only.

Heyman's assumptions: no tensile strength, infinite compressive strength,
no sliding (friction is optional and off by default).

Static (lower-bound) theorem as a linear program, solved with HiGHS:
  unknowns per joint j = 0..N (joint 0 and N are the springings on the ground):
      Fx_j, Fy_j  force the block on the left of joint j exerts on the block on its right
      M_j         moment of that force about the joint's mid-point
  per block k = 1..N (between joints k-1 and k): 3 equilibrium equations
      F_{k-1} - F_k + W_k + lam * P_k = 0      (forces)
      moments about the arch centre             (1 equation)
  per joint:   n_j = F_j . t_j >= 0              (no tension, t_j = joint normal)
               |M_j| <= n_j * t / 2              (thrust inside the section)
               [optional] |F_j . r_j| <= mu n_j  (no sliding)

Two problems:
  1. min thickness under self-weight: bisection on t, LP feasibility with lam = 0.
  2. collapse multiplier of a point load: max lam.

A kinematic (upper-bound) check enumerates every 4-hinge mechanism with joints
as hinge sites and returns the smallest admissible multiplier; with no sliding
it must coincide with the static one (uniqueness theorem).

Geometry: centre at the origin, centreline radius r, thickness t, depth d,
half-angle of embrace alpha (pi/2 = semicircle). Angle phi measured from the
left springing (phi = pi/2 - alpha) to the right one (phi = pi/2 + alpha).
A point at angle phi and radius rho is (-rho cos phi, rho sin phi).

Weights:
  'true'       each voussoir's real weight and centroid (annular sector)  -> Milankovitch
  'centreline' weight uniform along the centreline (Heyman's / CCR model)
"""
from __future__ import annotations

import argparse
import itertools
import json
import math
import sys
from dataclasses import dataclass

import numpy as np
from scipy.optimize import linprog


@dataclass
class Arch:
    r: float            # centreline radius [m]
    t: float            # thickness [m]
    d: float = 1.0      # depth [m]
    gamma: float = 1.0  # unit weight [kN/m3]
    alpha: float = math.pi / 2  # half-angle of embrace
    n: int = 40         # number of voussoirs
    weights: str = 'true'

    def joints(self):
        phi = np.linspace(math.pi / 2 - self.alpha, math.pi / 2 + self.alpha, self.n + 1)
        c = np.stack([-self.r * np.cos(phi), self.r * np.sin(phi)], 1)        # mid-points
        tdir = np.stack([np.sin(phi), np.cos(phi)], 1)                         # joint normal (direction of increasing phi)
        rdir = np.stack([-np.cos(phi), np.sin(phi)], 1)                        # outward radial
        return phi, c, tdir, rdir

    def blocks(self):
        phi, *_ = self.joints()
        a, b = phi[:-1], phi[1:]
        dphi, mid = b - a, (a + b) / 2
        ri, re = self.r - self.t / 2, self.r + self.t / 2
        if self.weights == 'true':
            area = dphi / 2 * (re ** 2 - ri ** 2)
            rho = (2 / 3) * (re ** 3 - ri ** 3) / (re ** 2 - ri ** 2) * np.sin(dphi / 2) / (dphi / 2)
        else:
            area = dphi * self.r * self.t
            rho = self.r * np.sin(dphi / 2) / (dphi / 2)
        w = self.gamma * self.d * area
        xg = -rho * np.cos(mid)
        return w, xg


def point_on_extrados(arch: Arch, x: float):
    """Block index and point where a vertical load at abscissa x meets the extrados."""
    re = arch.r + arch.t / 2
    phi = math.acos(max(-1.0, min(1.0, -x / re)))
    jphi, *_ = arch.joints()
    k = int(np.clip(np.searchsorted(jphi, phi) - 1, 0, arch.n - 1))
    return k, np.array([x, re * math.sin(phi)])


def build_lp(arch: Arch, live=None, mu=None):
    """Equality/inequality matrices. Variables: [Fx_0, Fy_0, M_0, ..., Fx_N, Fy_N, M_N, lam]."""
    N = arch.n
    nv = 3 * (N + 1) + 1
    L = nv - 1
    phi, c, tdir, rdir = arch.joints()
    w, xg = arch.blocks()
    Aeq = np.zeros((3 * N, nv)); beq = np.zeros(3 * N)
    for k in range(N):
        jl, jr = k, k + 1
        row = 3 * k
        # x: Fx_l - Fx_r = 0
        Aeq[row, 3 * jl] = 1; Aeq[row, 3 * jr] = -1
        # y: Fy_l - Fy_r - w_k + lam*P = 0
        Aeq[row + 1, 3 * jl + 1] = 1; Aeq[row + 1, 3 * jr + 1] = -1; beq[row + 1] = w[k]
        # moment about origin: M_l + (c_l x F_l) - M_r - (c_r x F_r) + xg*(-w) [+ xP*(lam*-P)] = 0
        Aeq[row + 2, 3 * jl + 2] = 1; Aeq[row + 2, 3 * jr + 2] = -1
        Aeq[row + 2, 3 * jl] += -c[jl, 1]; Aeq[row + 2, 3 * jl + 1] += c[jl, 0]
        Aeq[row + 2, 3 * jr] -= -c[jr, 1]; Aeq[row + 2, 3 * jr + 1] -= c[jr, 0]
        beq[row + 2] = xg[k] * w[k]
    if live is not None:
        k, p, P = live
        Aeq[3 * k + 1, L] = -P               # lam * (-P) moved to the left side
        Aeq[3 * k + 2, L] = -p[0] * P
    Aub, bub = [], []
    for j in range(N + 1):
        n_row = np.zeros(nv); n_row[3 * j:3 * j + 2] = tdir[j]
        Aub.append(-n_row); bub.append(0.0)                       # n >= 0
        for s in (1, -1):                                         # |M| <= n t/2
            row = np.zeros(nv); row[3 * j + 2] = s; row -= n_row * arch.t / 2
            Aub.append(row); bub.append(0.0)
        if mu is not None:
            s_row = np.zeros(nv); s_row[3 * j:3 * j + 2] = rdir[j]
            for s in (1, -1):
                Aub.append(s * s_row - mu * n_row); bub.append(0.0)
    return Aeq, beq, np.array(Aub), np.array(bub)


def solve(arch: Arch, live=None, mu=None, objective='lam'):
    Aeq, beq, Aub, bub = build_lp(arch, live, mu)
    nv = Aeq.shape[1]
    cost = np.zeros(nv)
    bounds = [(None, None)] * (nv - 1) + [(0, None) if live is not None else (0, 0)]
    if objective == 'lam':
        cost[-1] = -1
    res = linprog(cost, A_ub=Aub, b_ub=bub, A_eq=Aeq, b_eq=beq, bounds=bounds, method='highs')
    return res


def thrust_points(arch: Arch, x):
    """Thrust-line points (where the joint resultant crosses each joint) and eccentricities."""
    phi, c, tdir, rdir = arch.joints()
    F = x[:-1].reshape(-1, 3)
    n = np.einsum('ij,ij->i', F[:, :2], tdir)
    e = -F[:, 2] / np.where(n > 1e-12, n, np.nan)          # outward eccentricity (M = -e n)
    pts = c + e[:, None] * rdir
    return pts, e, n


def hinges(arch: Arch, e, tol=1e-4):
    """Joints where the thrust touches intrados (-) or extrados (+)."""
    phi, *_ = arch.joints()
    out = []
    a = np.nan_to_num(np.abs(e), nan=-1.0)
    for j, ej in enumerate(e):
        if np.isnan(ej):
            continue
        nb = [a[i] for i in (j - 1, j + 1) if 0 <= i < len(a) and np.sign(e[i]) == np.sign(ej)]
        if nb and a[j] < max(nb):            # keep one hinge per contact: the joint closest to the face
            continue
        if abs(abs(ej) - arch.t / 2) <= tol * arch.t:
            out.append((j, math.degrees(phi[j]), 'extrados' if ej > 0 else 'intrados'))
    return out


def min_thickness(r, n, weights, alpha=math.pi / 2, iters=60):
    """Bisection on t/r for the least thickness that admits equilibrium under self-weight."""
    lo, hi = 0.0, 0.5
    for _ in range(iters):
        mid = (lo + hi) / 2
        ok = solve(Arch(r=r, t=mid * r, n=n, weights=weights, alpha=alpha), objective='feas').status == 0
        lo, hi = (lo, mid) if ok else (mid, hi)
    arch = Arch(r=r, t=hi * r, n=n, weights=weights, alpha=alpha)
    res = solve(arch, objective='feas')
    return hi, arch, res


def kinematic_multiplier(arch: Arch, live):
    """Smallest multiplier over every admissible 4-hinge mechanism (upper bound)."""
    phi, c, tdir, rdir = arch.joints()
    w, xg = arch.blocks()
    k_live, p_live, P = live
    t = arch.t
    site = {+1: c + rdir * t / 2, -1: c - rdir * t / 2}   # extrados / intrados points of each joint
    cross = lambda a, b: a[0] * b[1] - a[1] * b[0]
    best = (math.inf, None)
    N = arch.n
    for h in itertools.combinations(range(N + 1), 4):
        for s0 in (+1, -1):
            sides = (s0, -s0, s0, -s0)                      # hinges alternate between extrados and intrados
            P1, P2, P3, P4 = (site[s][j] for s, j in zip(sides, h))
            # instantaneous centre of the middle body: lines P1P2 and P4P3
            d1, d2 = P2 - P1, P3 - P4
            den = cross(d1, d2)
            if abs(den) < 1e-12:
                continue
            u = cross(P4 - P1, d2) / den
            I = P1 + u * d1
            wA = 1.0
            a = P2 - P1; b = P2 - I
            if abs(b @ d1) < 1e-14:
                continue
            wB = wA * (a @ d1) / (b @ d1)
            a3 = P3 - I; b3 = P3 - P4
            if abs(b3 @ d2) < 1e-14:
                continue
            wC = wB * (a3 @ d2) / (b3 @ d2)
            omega = np.zeros(N); centre = np.zeros((N, 2))
            body = [(h[0], h[1], wA, P1), (h[1], h[2], wB, I), (h[2], h[3], wC, P4)]
            for (j0, j1, om, cc) in body:
                omega[j0:j1] = om; centre[j0:j1] = cc
            vy = lambda x, k: omega[k] * (x - centre[k, 0])          # vertical velocity of a point of block k
            work_dead = -np.sum(w * omega * (xg - centre[:, 0]))
            work_live = -P * vy(p_live[0], k_live)
            if abs(work_live) <= 1e-12:
                continue
            sgn = 1.0 if work_live > 0 else -1.0                      # the mechanism moves so the load does positive work
            work_dead, work_live = sgn * work_dead, sgn * work_live
            # relative rotation at each hinge must open the joint on the side opposite to the pivot
            rel = [sgn * x for x in (wA - 0.0, wB - wA, wC - wB, 0.0 - wC)]
            if any(r_ * s <= 1e-12 for r_, s in zip(rel, sides)):
                continue
            lam = -work_dead / work_live
            if 0 <= lam < best[0]:
                best = (lam, (h, sides))
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='.')
    ap.add_argument('--kinematic-max-n', type=int, default=40)
    a = ap.parse_args()
    out = {}

    # ---- Case 1: least thickness of a semicircular arch under self-weight -----------------
    # Reference: Rizzi, Cocchetti, Colasante, Rusconi (2010), SAHC 2010, Adv. Mater. Res. 133-134,
    # 467-472, doi:10.4028/www.scientific.net/AMR.133-134.467, Table 1 (p. 469), alpha = 90 deg:
    REF = {
        'true':       dict(label='Milankovitch (true weights)', eta=0.107478, beta=54.4840, h=0.620881),
        'centreline': dict(label='CCR (weight on centreline)',  eta=0.107426, beta=54.4963, h=0.621772),
    }
    HEYMAN = dict(eta=0.105965, beta=58.8293, h=0.621113)
    r = 1.0
    case1 = []
    for weights in ('true', 'centreline'):
        for n in (10, 20, 40, 80, 13, 25, 51, 101, 201):
            eta, arch, res = min_thickness(r, n, weights)
            pts, e, nn = thrust_points(arch, res.x)
            hz = hinges(arch, e, tol=2e-3)
            # haunch hinge: the left-half joint where the thrust comes closest to the intrados
            phi_j = arch.joints()[0]
            left = [j for j in range(len(e)) if 0 < phi_j[j] < math.pi / 2 - 1e-9]
            jh = min(left, key=lambda j: e[j])
            beta = 90 - math.degrees(phi_j[jh])
            H = res.x[0]                                          # horizontal thrust at the left springing
            w_line = arch.gamma * arch.d * arch.t                  # weight per unit length of centreline
            h = abs(H) / (w_line * r)
            case1.append(dict(weights=weights, n=n, eta=eta, beta=beta, h=h, hinges=hz))
    out['case1'] = dict(reference=REF, heyman_closed_form=HEYMAN, results=case1)

    # ---- Case 2: point load at quarter span (Orduna 2004 geometry, WITHOUT backfill) ------
    ri, t = 2.35, 0.30
    arch2 = dict(r=ri + t / 2, t=t, d=1.0, gamma=20.0)
    span = 2 * ri
    xq = -span / 2 + span / 4                                      # quarter of the clear span, from the left
    case2 = []
    for n in (10, 20, 31, 40, 80, 160):
        arch = Arch(n=n, **arch2)
        k, p = point_on_extrados(arch, xq)
        res = solve(arch, live=(k, p, 1.0))
        lam = res.x[-1]
        pts, e, nn = thrust_points(arch, res.x)
        hz = hinges(arch, e, tol=1e-6)
        row = dict(n=n, P_collapse_kN=lam, hinges=hz)
        if n <= a.kinematic_max_n:
            lam_k, mech = kinematic_multiplier(arch, (k, p, 1.0))
            row['P_kinematic_kN'] = lam_k
        case2.append(row)
    out['case2'] = dict(geometry=dict(ri=ri, t=t, d=1.0, gamma=20.0, x_load=xq), results=case2)

    json.dump(out, open(f'{a.out}/python_highs.json', 'w'), indent=1, default=float)

    print('\nCASE 1  least thickness of a semicircular arch (r = centreline radius)')
    for weights in ('true', 'centreline'):
        ref = REF[weights]
        print(f"  {weights:10s} reference {ref['label']}: t/r = {ref['eta']}, beta = {ref['beta']} deg, H/(wr) = {ref['h']}")
        print('    N     t/r        err%     beta[deg]  H/(wr)    err%')
        for c in case1:
            if c['weights'] != weights:
                continue
            print(f"   {c['n']:4d}  {c['eta']:.6f}  {100*(c['eta']/ref['eta']-1):+7.3f}   {c['beta']:7.2f}   {c['h']:.5f}  {100*(c['h']/ref['h']-1):+7.3f}")
    print('\nCASE 2  point load at quarter span, Orduna geometry without backfill')
    print('    N   P_c static [kN]   P_c kinematic [kN]   hinges (deg from left springing, side)')
    for c in case2:
        kin = f"{c['P_kinematic_kN']:.4f}" if 'P_kinematic_kN' in c else '   -   '
        hz = ', '.join(f"{deg:.1f}{'e' if s=='extrados' else 'i'}" for j, deg, s in c['hinges'])
        print(f"   {c['n']:3d}   {c['P_collapse_kN']:12.4f}   {kin:>14s}       {hz}")


if __name__ == '__main__':
    sys.exit(main())
