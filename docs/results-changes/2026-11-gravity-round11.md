# Zero moments and stored load restoration

PR #2219 round 11 normalizes all-zero distributed member moments to absence.
Deserialization and the shared moment reader agree, including programmatically
constructed loads. Validation, fixed-end force assembly, refinement, scaling and
force recovery use the shared reader. The nonzero moment span limit remains
1e-10 of member length. It does not apply to a force load with absent or all-zero
moments. Native linear, prepared, P–Delta and corotational tests and WASM linear,
P–Delta and corotational tests compare the complete zero/absent results, including
a force span of 5e-11 on a unit cantilever. Force, moment and unloaded-torsion
controls remain active. Plane moment fields continue to refuse.

Re-solving cannot reconstruct physical loads damaged by an earlier rotation or
subdivision. Manual member loads now carry their own restoration version, retained
through snapshots and edits. Unknown or old manual loading keeps the
`gravity-stations-and-edits` notice even with a current solve stamp. Recreating
the affected loads from the originals stamps their restoration independently.
Copying, subdividing, editing a component or merely solving does not certify that
the original loading was restored. Generated and floor loading keep their
separate regeneration provenance. Mixed manual load versions use the oldest.

The round-6 torque tests now assert refusal below the same relative moment span
limit and retain their original hand torsion/twist assertions above it. Boundary
coverage includes the exact limit and its adjacent floating-point values. Region
fixtures with nonzero sub-limit moment fringes explicitly assert refusal. Their
original per-carrier shear, bending, torsion and displacement assertions still
run on independent supported physical profiles for each rotation, reflection and
subdivision. No nonzero fringe is deleted, widened or replaced by nodal loads in
production. The geometric fringe repair remains deferred.

The legacy bridge negative test supplies only the recorded bridge correction to
the judge. Its original negative assertions are unchanged; unrelated later
results changes cannot excuse an injected value change in this historical test.

## Audited governing moment changes

Only three snapshots are updated: `pro-3d-tower` (4 values),
`pro-rc-qa-diagnostic-shells` (2), and `pro-mat-foundation` (74). All 80 changed
fields are `envelope.governing[eN].momentY.value`. No displacement, reaction,
member end force, load, design result, combination identity or other snapshot
field changes. These are the intended extrema improvements already registered
by `gravity-density-extrema`. The `gravity-governing-moment-extrema` entry also
covers frames loaded only by self-weight, which have no explicit `memberLoads`
feature. The original geometry changes remain documented
in [round 7](2026-11-gravity-round7.md).

Before updating any snapshot, an independent Python calculation integrated each
combination's raw member force profile, solved Vz(x)=0 on every load interval,
and checked interval ends, point-load stations and member end moments. Every
new maximum below matches that calculation. Each old value matches the former
21-station uniform grid (20 intervals), read from origin/main's diagram code.
This identifies every moved value as an off-grid interior maximum, without
changing a tolerance or accepting an unrelated numerical change.

The table records the snapshot values, governing combination, physical member
station and independently integrated maximum. The unrounded maximum is computed
from member equilibrium, M(x)=M(0)+Vz(0)x+integral(q(s)(x-s) ds), and its stationary
points. There are no moment densities, variable pieces or ABS/SRSS combinations
in these audited member force records.

| Snapshot | Member | Before | After | Combination | Station (m) | Independent maximum |
| --- | --- | --- | --- | --- | --- | --- |
| pro-3d-tower | 10 | 0.3451605375 | 0.3457814372 | 2 | 0.959532876762 | 0.345781437181 |
| pro-3d-tower | 12 | 0.3494579952 | 0.349465839 | 2 | 1.10454837534 | 0.349465839006 |
| pro-3d-tower | 14 | 0.3583608792 | 0.358375142 | 2 | 0.993866711523 | 0.358375141989 |
| pro-3d-tower | 16 | 0.3586924266 | 0.3593983493 | 2 | 1.05685105645 | 0.359398349304 |
| pro-rc-qa-diagnostic-shells | 23 | 28.12820057 | 28.12833704 | 1 | 0.339915411856 | 28.1283370359 |
| pro-rc-qa-diagnostic-shells | 24 | 28.12820057 | 28.12833704 | 1 | 0.339915411856 | 28.1283370359 |
| pro-mat-foundation | 101 | 11.49885155 | 11.50874028 | 2 | 2.13137844616 | 11.5087402774 |
| pro-mat-foundation | 102 | 22.88026293 | 22.89811469 | 2 | 1.90779999553 | 22.8981146939 |
| pro-mat-foundation | 105 | 10.22897333 | 10.23058471 | 2 | 2.02770060914 | 10.2305847148 |
| pro-mat-foundation | 106 | 6.251930409 | 6.255146619 | 2 | 1.96086525171 | 6.25514661923 |
| pro-mat-foundation | 109 | 21.07733762 | 21.0817023 | 2 | 1.44558971903 | 21.081702303 |
| pro-mat-foundation | 10 | 15.67228516 | 15.67362218 | 2 | 2.27523239929 | 15.673622178 |
| pro-mat-foundation | 111 | 29.373472 | 29.37359104 | 2 | 2.60752906064 | 29.3735910426 |
| pro-mat-foundation | 112 | 33.14000316 | 33.14789378 | 2 | 1.46129793946 | 33.1478937826 |
| pro-mat-foundation | 114 | 7.521389278 | 7.528960399 | 2 | 2.06004411477 | 7.52896039897 |
| pro-mat-foundation | 115 | 15.27631372 | 15.27669564 | 2 | 1.98651418043 | 15.2766956373 |
| pro-mat-foundation | 116 | 6.250154272 | 6.250333576 | 2 | 1.99075971776 | 6.25033357563 |
| pro-mat-foundation | 118 | 8.443367293 | 8.449244839 | 2 | 2.05290398699 | 8.44924483943 |
| pro-mat-foundation | 119 | 18.51359344 | 18.51390313 | 2 | 2.01214380433 | 18.5139031284 |
| pro-mat-foundation | 11 | 18.27554825 | 18.27636382 | 2 | 2.23029297549 | 18.2763638204 |
| pro-mat-foundation | 120 | 7.376844818 | 7.389946847 | 2 | 1.92101227255 | 7.38994684664 |
| pro-mat-foundation | 121 | 7.780239461 | 7.783315113 | 2 | 1.96172995762 | 7.78331511273 |
| pro-mat-foundation | 122 | 6.616350588 | 6.63337067 | 2 | 1.9099733315 | 6.63337067023 |
| pro-mat-foundation | 126 | 6.561625403 | 6.580633413 | 2 | 2.10486097828 | 6.58063341337 |
| pro-mat-foundation | 127 | 8.462750698 | 8.468794886 | 2 | 2.05364871469 | 8.46879488599 |
| pro-mat-foundation | 14 | 16.34855431 | 16.34879944 | 2 | 2.26080408463 | 16.348799438 |
| pro-mat-foundation | 15 | 13.72978596 | 13.73036344 | 2 | 2.23341708039 | 13.7303634442 |
| pro-mat-foundation | 18 | 27.33389587 | 27.34117751 | 2 | 2.64111493727 | 27.3411775114 |
| pro-mat-foundation | 19 | 16.94470897 | 16.94634775 | 2 | 1.8279351737 | 16.9463477541 |
| pro-mat-foundation | 1 | 9.182172081 | 9.188239357 | 2 | 2.19624891642 | 9.18823935731 |
| pro-mat-foundation | 22 | 12.7837652 | 12.80254598 | 2 | 2.60543137393 | 12.8025459758 |
| pro-mat-foundation | 23 | 23.18334277 | 23.20415643 | 2 | 1.92544467251 | 23.2041564277 |
| pro-mat-foundation | 25 | 6.001136645 | 6.001394938 | 2 | 2.26109039905 | 6.00139493824 |
| pro-mat-foundation | 28 | 22.25501221 | 22.26435007 | 2 | 2.76668283605 | 22.2643500738 |
| pro-mat-foundation | 29 | 23.23693903 | 23.24667759 | 2 | 1.73190145866 | 23.2466775929 |
| pro-mat-foundation | 2 | 9.215836202 | 9.238785864 | 2 | 2.14546096231 | 9.23878586424 |
| pro-mat-foundation | 31 | 16.13665541 | 16.13746326 | 2 | 2.26961362527 | 16.1374632633 |
| pro-mat-foundation | 32 | 6.957233749 | 6.957410255 | 2 | 2.24083209532 | 6.95741025485 |
| pro-mat-foundation | 33 | 10.33903204 | 10.34106929 | 2 | 2.28114674448 | 10.3410692874 |
| pro-mat-foundation | 34 | 11.50180026 | 11.52077915 | 2 | 2.15493386986 | 11.5207791536 |
| pro-mat-foundation | 36 | 6.634052183 | 6.637344154 | 2 | 2.21040701027 | 6.63734415356 |
| pro-mat-foundation | 37 | 5.65480105 | 5.658332647 | 2 | 2.29100869502 | 5.65833264722 |
| pro-mat-foundation | 38 | 7.365155952 | 7.375841017 | 2 | 2.17866889899 | 7.37584101694 |
| pro-mat-foundation | 39 | 13.27784878 | 13.29027605 | 2 | 2.32692691211 | 13.2902760513 |
| pro-mat-foundation | 40 | 9.382934932 | 9.385231438 | 2 | 2.21693076115 | 9.38523143839 |
| pro-mat-foundation | 42 | 27.85736019 | 27.86670422 | 2 | 2.63329516611 | 27.8667042179 |
| pro-mat-foundation | 43 | 24.00367905 | 24.00455333 | 2 | 1.8204039311 | 24.0045533274 |
| pro-mat-foundation | 46 | 28.16462282 | 28.16911087 | 2 | 2.74622952128 | 28.1691108742 |
| pro-mat-foundation | 49 | 5.626192225 | 5.632341611 | 2 | 2.3041135782 | 5.63234161129 |
| pro-mat-foundation | 51 | 14.35601011 | 14.35710748 | 2 | 2.22714051668 | 14.3571074768 |
| pro-mat-foundation | 54 | 16.28300405 | 16.28512264 | 2 | 2.2817624232 | 16.2851226389 |
| pro-mat-foundation | 55 | 18.84119548 | 18.84148804 | 2 | 2.2381968318 | 18.8414880415 |
| pro-mat-foundation | 57 | 9.025401431 | 9.029748087 | 2 | 2.20450455116 | 9.02974808664 |
| pro-mat-foundation | 58 | 8.461726051 | 8.473434286 | 2 | 2.17533173323 | 8.47343428588 |
| pro-mat-foundation | 63 | 8.578244861 | 8.595479005 | 2 | 2.3405910343 | 8.59547900523 |
| pro-mat-foundation | 64 | 9.577786747 | 9.584144597 | 2 | 2.30502315464 | 9.58414459678 |
| pro-mat-foundation | 65 | 8.114388005 | 8.119857812 | 2 | 1.94896403568 | 8.11985781162 |
| pro-mat-foundation | 66 | 6.953848452 | 6.973989416 | 2 | 1.90206668076 | 6.97398941562 |
| pro-mat-foundation | 70 | 6.220044317 | 6.239784615 | 2 | 2.09695432754 | 6.23978461474 |
| pro-mat-foundation | 71 | 8.128602154 | 8.1321121 | 2 | 2.04088279275 | 8.1321120996 |
| pro-mat-foundation | 72 | 7.998513287 | 8.009028587 | 2 | 2.07076217734 | 8.00902858688 |
| pro-mat-foundation | 73 | 17.28985742 | 17.29041669 | 2 | 1.98368069867 | 17.2904166922 |
| pro-mat-foundation | 76 | 5.320448679 | 5.328499067 | 2 | 2.0619154121 | 5.32849906747 |
| pro-mat-foundation | 77 | 16.50004973 | 16.50023176 | 2 | 2.00931032256 | 16.5002317645 |
| pro-mat-foundation | 78 | 6.89972081 | 6.909508378 | 2 | 1.93173033513 | 6.9095083785 |
| pro-mat-foundation | 7 | 9.099317392 | 9.115808363 | 2 | 2.33861627016 | 9.11580836346 |
| pro-mat-foundation | 80 | 37.45067957 | 37.47100337 | 2 | 2.49837681733 | 37.4710033698 |
| pro-mat-foundation | 81 | 26.51244373 | 26.519527 | 2 | 1.3419225845 | 26.5195270037 |
| pro-mat-foundation | 83 | 23.93836588 | 23.95777519 | 2 | 2.5038619261 | 23.9577751949 |
| pro-mat-foundation | 84 | 27.66253868 | 27.6653792 | 2 | 1.56322189227 | 27.6653791992 |
| pro-mat-foundation | 87 | 13.44329659 | 13.45444791 | 2 | 2.12712919279 | 13.4544479141 |
| pro-mat-foundation | 88 | 25.99832117 | 26.01205912 | 2 | 1.91911811098 | 26.0120591201 |
| pro-mat-foundation | 89 | 6.773659873 | 6.775739162 | 2 | 1.96853354525 | 6.77573916234 |
| pro-mat-foundation | 8 | 8.629786766 | 8.633893751 | 2 | 2.29422337777 | 8.63389375082 |
| pro-mat-foundation | 91 | 8.280958923 | 8.282113852 | 2 | 2.02345135578 | 8.28211385165 |
| pro-mat-foundation | 92 | 5.796584689 | 5.798680856 | 2 | 1.96840609751 | 5.79868085625 |
| pro-mat-foundation | 93 | 9.758258524 | 9.758316946 | 2 | 1.9947255189 | 9.75831694644 |
| pro-mat-foundation | 95 | 37.91034593 | 37.92898486 | 2 | 2.89421083799 | 37.9289848634 |
| pro-mat-foundation | 96 | 46.79134405 | 46.79259896 | 2 | 1.22444541714 | 46.7925989634 |
| pro-mat-foundation | 99 | 10.02518535 | 10.02566553 | 2 | 2.01512142755 | 10.0256655322 |

Restore suspect manual loading from its original specification, regenerate
applicable generated/floor loads, then rerun analyses, combinations, diagrams
and checks. The existing known-wrong-result skips and deferred #2222/#2252
work are unchanged. This record assigns no safety advisory.
