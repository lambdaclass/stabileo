# Snow drift coverage follows continuous roof edges

PR #2095 fixes two drift geometry defects and refuses a third
unsupported geometry. This correction is included in 0.6.1 (PR #2095).

Roof grouping previously compared panel datum elevations. Continuous pitched
panels can have different datums while meeting at the same physical height.
Grouping now checks the elevations at both ends of a shared edge interval.
Drift and sliding bands and fetch use this same connected group. Actual steps
and gaps remain separate. In the split pitched receiver witness, sliding on
the second panel was zero instead of 0.10666666666666669 with the direct test
inputs. The fetch witness read 1 instead of 30. The public generator uses each
source roof's local snow factor, including its own minimum-load applicability.

Pitched carriers previously formed their tributary normal by dividing the
horizontal direction by the full member length. The sampled horizontal depth
was shortened while the integral was multiplied by the original depth. The
normal now uses horizontal length. For the test's triangular surcharge,
q = pd * (depth - depth² / (2*w)). The repository's stepDrift calculation gives
pd and w; the integral is calculated independently in the test. For the
unit-gradient carrier and depth 0.4, the parent gives 0.9334323518520826
instead of 0.9180496000000002. Flat carriers retain their answer.

Sliding coverage previously used the minimum and maximum of source endpoints
lying on the receiver. A longer source eave could overlap a shorter receiver
without either endpoint lying on it, silently producing no sliding load.
Taking only the clipped interval would still leave partial coverage boundaries
inside the existing fixed-station load sampler. A general integration and
longitudinal partition refactor is deliberately deferred. Instead, a shared
preflight intersects source footprint edges with receiving edges and requires
continuous, complete, aligned coverage. Partial coverage, overhanging source
endpoints and disconnected intervals refuse with snow.refused.slidingOverlap.
Touch-only and disjoint sources do not trigger this refusal. Fully aligned
continuous eaves retain their existing sliding answer.

The preflight runs before any snow case is constructed and at the direct
surcharge entry point. When no roof panels were supplied, it obtains the same
panel geometry from gravityLayout for this check; it does not use individual
inferred facets as separate receiving panels. Projected loads, width layouts,
panel layouts and load planning therefore share the refusal. Refusal returns
no snow cases or loads and blocks the planner. The UI receives the translated
reason in all six supported languages. Source geometry is checked before
solver selection; this TypeScript generator has no separate native Rust,
WASM, linear or nonlinear implementation. Planar section controls remain valid.

The local origin/main reference 013485aa2629a05672403919060cc1397f510fd1
was replayed inside this worktree, restoring both generator files byte-for-byte.
On the same primary witnesses it silently returns zero sliding for both the
split receiver and overhanging eave, and zero surcharge on the pitched carrier.
The parent branch instead returns the wrong nonzero pitched-carrier integral
above. No new advisory is created; advisory disposition remains with the
coordinator. See the worktree handoff for numerical and refusal replay evidence.

Regenerate affected snow loads, then rerun analyses, combinations and design
checks. Merely re-solving previously generated loads is insufficient. The
registry notice applies only to projects with generated snow loads. No
engineering tolerance, baseline or existing assertion was relaxed.
