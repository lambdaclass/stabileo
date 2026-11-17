# Declared-gravity RC baseline after stirrup closure enforcement (#2198)

The accepted declared-gravity `rc-design-frame` baseline is now 368 VERIFIED,
27 SEARCH_EXHAUSTED and 13 PROVISIONAL_BIAXIAL, with fingerprint
`b51c20fa1890613c`. The former baseline was 376 / 19 / 13 and
`88cfb03b363bf253`. All 408 members are accounted for. No member changes from
refused to verified. No production result changes in this baseline update.

## Attribution

The [machine-readable comparison](2198-rc-baseline-closure.json) records every
changed outcome, constraint, accepted reinforcement and certified utilization,
plus the previous accepted candidate's failed checks and joint verdicts.
Its before/after rows isolate closure on parent `1cd95046e`: the before
reinforcement is the current run with only the pre-closure domain restored.
The previous-candidate rechecks independently use the historical declared-gravity
reinforcement in [the round-4 evidence](2171-round4-flagship.json).

Four targeted runs isolate the cause, using the current solver and all other
current production files. Temporarily replacing only
`web/src/lib/engine/detailing/joint-threading.ts` with its version immediately
before `40dc804e0` restores the old fingerprint exactly, including every
outcome, constraint and rounded utilization. Replacing only
`web/src/lib/engine/station-design-forces.ts` with its version immediately
before `a3a750634` retains today's fingerprint exactly. Replacing both restores
the old fingerprint. Each temporary file was restored after the replay.

Thus the documented mandatory stirrup-closure eligibility correction in
`40dc804e0`, on this branch, explains the entire digest change. Main's merged
refusals and the branch's later primary-depth correction contribute no digest
change on this exact model. The earlier directional-cage changes are already
included in the accepted 376-member baseline; they are not eight new changes
introduced by merging main.

## Every changed outcome

Each following member was VERIFIED and is now SEARCH_EXHAUSTED. Rechecking
its exact former accepted reinforcement with the final designed column cages
fails `Bars through the joint` at both ends. Before closure became mandatory,
the shared domain could offer a layout whose stirrup could not close. The
bounded search now has no eligible arrangement that satisfies all checks.
This is no proof of section inadequacy. None receives accepted reinforcement,
a certificate or an insufficiency proof.

| Member | Final limiting constraints | Reason |
| --- | --- | --- |
| 180 | anchorage, congestion | Former candidate fails threading at both joints under mandatory closure; retained failing alternative also fails anchorage. |
| 181 | congestion | Former candidate fails threading at both joints under mandatory closure. |
| 186 | anchorage, congestion | Former candidate fails threading at both joints under mandatory closure; retained failing alternative also fails anchorage. |
| 187 | congestion | Former candidate fails threading at both joints under mandatory closure. |
| 192 | congestion | Former candidate fails threading at both joints under mandatory closure. |
| 195 | congestion | Former candidate fails threading at both joints under mandatory closure. |
| 197 | congestion | Former candidate fails threading at both joints under mandatory closure. |
| 198 | anchorage, congestion | Former candidate fails threading at both joints under mandatory closure; retained failing alternative also fails anchorage. |

Members 162, 163, 171, 172, 182 and 188 remain SEARCH_EXHAUSTED. Each changes
from `congestion` to `anchorage,congestion`: excluding blocked closures changes
the best failing proposal retained by the bounded search. No acceptance changes.

Six other members retain VERIFIED with different accepted reinforcement:

| Member | Certified utilization before → after | Reason |
| --- | --- | --- |
| 193 | 0.919 → 0.980 | Closure-compatible replacement changes bottom/support bars and stirrup spacing. |
| 194 | 0.921 → 0.980 | Closure-compatible replacement changes bottom/support bars and stirrup spacing. |
| 223 | 0.792 → 0.818 | Closure-compatible replacement changes bottom/support layers and stirrup diameter/spacing. |
| 226 | 0.792 → 0.818 | Closure-compatible replacement changes bottom/support layers and stirrup diameter/spacing. |
| 328 | 0.769 → 0.704 | Closure-compatible replacement changes bottom/support bars. |
| 331 | 0.769 → 0.704 | Closure-compatible replacement changes bottom/support bars. |

In the closure-only comparison, the other 388 members have unchanged outcome,
constraints, accepted reinforcement and certified utilization. No column changes. Seven historical round-4 stirrup spacings already differ in
the pre-closure replay (173, 192, 195, 197, 198, 254 and 257); those differences
do not move any digest field and are not attributed to closure. These are capacity/design
outcomes, not physical constructibility approvals.

## Shared acceptance and validation

The existing [shared accepted-count source](2198-round6-undeclared.json) now
also carries a separate `declaredGravity` baseline: named counts, fingerprint
and all 408 exact digest lines. Its historical undeclared-role evidence is
preserved. The digest and aggregate regression both consume this same declared
baseline; their expectations can no longer drift through independent count
literals. The digest additionally checks each member line, making identity,
reason and utilization changes reviewable without reverse-engineering a hash.

The signed reproducer commit adds the per-member comparison using the
repository's conditional Vitest skip convention for `known wrong result:
#2198`. Enabled on parent production, it fails against the previous accepted
baseline. The final commit records the audited closure correction and removes
the skip. The original test also fails on the parent in all three places:
count, fingerprint and refused-member set.

The full digest, the targeted aggregate outcome case and the existing closure
domain regressions are the selected checks. Closure regressions retain both
editions, both sides of layer/count refusal boundaries, partial coordination
and a correct single-row control. This task changes no native/WASM, planar/
spatial, linear/nonlinear production path and adds no new soundness policy.
The digest and aggregate run the real WASM solve. No tolerance, engineering
limit, search budget or physical approval assertion is relaxed.

The existing pending `directional-stirrup-legs` registry entry already covers
mandatory closure before design threading and detailing coordination; its
linked [results record](2026-11-directional-stirrup-legs.md#stirrup-closure-is-a-beam-layout-constraint-2198)
contains that correction. No new registry event, results version or advisory
is appropriate for recording an already documented result change.
