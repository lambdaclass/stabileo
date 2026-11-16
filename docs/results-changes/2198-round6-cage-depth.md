# Cage depth, seismic end hoops and secondary candidates (2026-11-16)

PR #2198 round 6 corrects regressions on the unmerged directional-cage branch.
The pending `directional-stirrup-legs` registry entry covers these changes;
its concrete-member selection is unchanged. No new results version is assigned
and no new advisory is introduced. The existing SA-2026-075 screening is
broadened to include inadequate distribution and omitted secondary checks even
when both directional counts are two.

## Corrected behavior

The provided beam/wall verifier now derives secondary effective depth from each
actual start, span or end cage, with the largest declared longitudinal diameter.
That one cage-local depth feeds both secondary shear and combined shear/torsion.
Previously every cage used the nominal section stirrup diameter. A thicker cage
therefore received excessive depth and capacity; a thinner one lost capacity.
Main's torsion path already used the actual cage diameter with its assumed
longitudinal diameter. This branch had regressed that behavior.

The independent shear arithmetic in `issue-2198-round6.test.ts` uses the edition's
concrete term and shear cap, and the checked-in bar area, without calling the
shear capacity implementation to obtain the expected answer. For a 0.4 by 0.4 m
H25/420 section with 25 mm cover, four 16 mm longitudinal bars, nominal 8 mm
stirrups and four secondary legs at 0.1 m, a 12 mm cage has secondary depth
0.355 m. The old depth was 0.359 m. Under 2005 the reported capacity changes
from 448.75 to 441.98 kN. Under 2025 it changes from 446.96 to 441.98 kN.
Tests retain exact capacity comparisons, both sides of the strength boundary,
reversed start/end diameters, and unchanged nominal cages.

Seismic detailing previously sized hoops using the shared support's primary leg
count, then wrote that spacing to end cages while retaining their different leg
counts. It now evaluates every support/end cage for every trial diameter, using
the trial diameter's depth. A refusal by any end rejects that trial. The common
spacing satisfies every end and all existing limits; directional counts are
preserved. A beam with shared four-leg 8 mm hoops, one two-leg end, depth based
on a 0.6 m section, 25 mm cover and 16 mm longitudinal bars, and capacity shear
240 kN with zero concrete contribution previously received 0.125 m spacing;
the two-leg end permits only 0.05 m on the unchanged grid. Tests also retain
concrete contribution, mirrored ends, three/four legs, a lighter demand, and a
1000 kN refusal that leaves the reinforcement unchanged. Seismic rows remain
explicitly unverified substitute checks; this correction does not change their
regulatory status.

Beam and column enumeration previously fixed secondary counts at the spacing
table's minimum. Both now enumerate that minimum through the existing maximum
of four. A shared bounded selector reserves the strongest offered candidate for each
higher supported secondary count, then fills remaining slots with the original
minimum-count options in their established order. The section evaluator supplies
the strength ordering, including each candidate diameter. Plain truncation could
otherwise discard every higher-count cage; assuming a sizing seed settles the
count could also omit options when the final longitudinal bars change depth.
The authoritative verifier still checks every actual tuple and decides
adequacy. A seed is an ordering hint, not a certificate.
The option bounds remain 30 for beams and 24 for columns; unsupported fifth-leg
requirements still have no adequate candidate. Restricted 6 mm cages on a
0.45 m square section exercise two, three, four and unsupported five-leg demand,
including a three-leg strength demand whose spacing table requires only two.

## Exact fixture accounting

The declared-gravity flagship remains 376 verified / 19 exhausted / 13
provisional, with the exact existing fingerprint unchanged. The undeclared
lateral-system case changes from 360 verified / 35 exhausted to 362 verified /
33 exhausted; the 13 provisional outcomes and zero section-inadequate outcomes
remain. Every previously verified member remains verified. The two changes are
members 204 and 207, previously exhausted on anchorage. Source-isolation runs
produce 362 with the depth correction alone and 360 with the enumeration change
alone. The bounded search reaches different arrangements after the depth change;
an old exhaustion did not prove those sections inadequate.

The [recorded member evidence](2198-round6-undeclared.json) preserves all 360
previously verified identities and both accepted arrangements. The lateral
fixture regression still requires every old identity to verify, pins the two
new arrangements exactly and independently checks secondary shear and both
spacing limits at every concurrent station. Their accepted support/span cages
are 6 mm, three primary/three secondary legs at 0.15 m on 0.35 by 0.65 m
sections with 25 mm cover and 12 mm longitudinal bars. Their actual secondary
depth is 0.313 m. The [four-member hand audit](2198-round6-flagship-depth.json) also updates
secondary capacities for members 180/181/186/187 using their actual 12 mm cages:
secondary depth is 0.308 m, with support/span capacities 357.96 kN on 180/186
and 357.95 kN on 181/187. Primary rows and the governing fingerprint remain
unchanged. The earlier hand oracle used the nominal 8 mm diameter and is
corrected without relaxing any exact capacity assertion.

No tolerance or acceptance limit is relaxed.

## Reproduction and coverage

Signed test-only commits `f8d74cb15`, `d2ba74de2` and `38c4fc54c` precede the implementation.
The second corrects the solver fixture schemas and uses the gate-recognized
conditional `it`/`it.skip` alias. The third requires every supported secondary
count to survive retention even below the strength seed. It gates new
known-wrong tests with Vitest's skip equivalent of an ignored reproducer:

```
RUN_KNOWN_WRONG=2198 make test.web.unit FILE='src/lib/engine/__tests__/issue-2198-round6.test.ts src/lib/store/__tests__/issue-2198-seismic-ends.test.ts src/lib/blog/__tests__/directional-stirrup-advisory.test.ts' VITEST_WORKERS=1
```

The final assertions replayed against parent production `0a3883724` give 57
failures and 65 passing controls. Corrected production passes all 122 tests.
The implementation removes the skips. Coverage includes both beam/wall kinds,
both flexural axes, both editions, 2D primary controls and real 3D secondary
WASM solves under linear and P-Delta analysis, and both station transfer modes.
The changed policies are TypeScript entry points; there is no corresponding
native cage enumerator or seismic store. The existing native section evaluator
is used through WASM and is unchanged.

## Separate main defects

The secondary-width torsion minimum and the axial-force-dependent spacing-table
demand both reproduce on main `d0f23b375` and on branch parent `0a3883724`.
Per the coordinator's scope rule, this round leaves their implementation alone
and supplies ready-to-file reproducer text in the handoff. No issue closure or
new advisory number is claimed for them. The torsion check returns an
underestimated ratio on main; the retained axial-tension beam returns an
incorrect overall `ok` without a spacing warning. Release binaries were not
assessed. The coordinator decides issue/advisory handling.
