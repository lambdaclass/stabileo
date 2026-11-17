# Empty force intervals and distributed-load IDs

PR #2219 restores two input behaviours lost on the unmerged gravity branch.
Neither regression comes from main's #2236 concentrated-live safeguards or #2258
weld changes.

The shared member-span guard rejected an exactly empty distributed-force interval
(a = b), although finite force density on that interval has zero resultant and
zero work. The generated continuous-beam sweep creates such an interval on a
short overhang. Both solver-load builders now use the same source-load predicate to remove
only exactly empty manual force intervals with finite densities and finite support
inside the member. Generated loads, definition loads and intervals carrying a
positive source span still refuse if their endpoints collapse. The final native
span guard is unchanged, including for intervals collapsed by transformation. Linear, P–Delta, corotational, combination and worker paths
all obtain their loads from these builders. Unsupported positive spans still
refuse at the existing native minimum. No interval is widened or replaced by a
point force. Distributed moments still require their existing supported span.

The stricter plane distributed-load deserializer also rejected the existing
numeric `id` metadata field. The one shared schema used by both raw and typed
native/WASM parsing now explicitly accepts an optional numeric ID. Unknown
fields and every plane `moments` field, including null, still refuse. The
fixed-fixed UDL plastic test therefore reaches the existing structured #758
PL-2D-INVARIANCE refusal instead of failing during parsing.

The outcome change is from a branch-only false refusal to an ordinary verified
solve for empty force intervals, or to the intended safety refusal for 2D plastic
collapse. Supported positive-span force answers retain their original loading.
The new regressions compare complete linear and nonlinear answers with an
otherwise identical loaded control. No numerical tolerance, reference snapshot,
or existing assertion changes. Re-run affected models. This change creates no
advisory; main already accepts the inputs involved in these CI failures.
