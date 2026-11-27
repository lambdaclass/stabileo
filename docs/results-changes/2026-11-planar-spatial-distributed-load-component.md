# Preserve the planar component of spatial distributed loads (2026-11-25)

PR #2583 restores the distributed-load component selection in the Basic
model store. XY uses the authored qY values at member ends I and J.
XZ and YZ use the corresponding qZ values.

The earlier XY path handed the unconverted row to load accounting,
which refused it before analysis. The reviewed cantilever is 2 m long
and has qY endpoint intensities of −4 and −2 kN/m and zero qZ
intensities. Its downward resultant is (4 + 2) × 2 / 2 = 6 kN, and its
upward support reaction is 6 kN in the linear and P-Delta tests. XZ and
YZ give the same equilibrium when those intensities are authored in qZ.

Basic XY converts a row only if its qY component represents the load on
the drawn member. The conversion keeps any partial-span limits. Loads
with additional components or incompatible member geometry still reach
the existing translated refusal. If a Basic XY calculation previously
refused an in-plane spatial distributed load, rerun it to obtain results.
