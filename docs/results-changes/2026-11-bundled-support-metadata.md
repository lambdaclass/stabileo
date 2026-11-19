# Bundled models retain their explicit support restraints

Issue [#2277](https://github.com/lambdaclass/stabileo/issues/2277), round 4.

## What changed

The shared JSON fixture loader passed spring constants as the third argument to
`addSupport` and other support fields as the fourth. Older three-argument adapters
ignored the fourth argument. The `rc-beam-flexure` fixture already declared its
bearing mask, but deep-audit lost it and refused the model as ambiguous. Other
fixtures lost angles, settlements or custom restraints through the same adapters.

`FixtureLoader.model` now requires access to the stored supports. After creating
each support, the shared loader requires that it exists and copies the declared
metadata into it, including an independent copy of nested masks. An adapter that
returns an id without storing its support is refused. All callers use this one
path; no audit-specific repair or inferred roller direction is applied.

The only other bundled JSON fixture with `rollerZ`, `portal-frame-braced`, now
states the existing embedded-plane restraints explicitly. Its translations
X/Y/Z are held/held/free and rotations X/Y/Z are held/free/held, taken from
`supportDofs3D(s, true)`. The mask is global in the embedded XZ solver frame.
The 2D solver continues to use its named horizontal restraint. The
`rc-beam-flexure` bearing retains its previously declared mask unchanged.

## Results and compatibility

The native numerical engine is unchanged. Correct four-argument loaders already
retained the RC beam mask, and its application result remains the same. Older
adapters now retain the same input and can solve it. Previously dropped explicit
restraints on custom supports can change adapter-produced engine results; these
must be recomputed. The braced portal retains its plane and embedded-plane
answers. Reading its explicit global mask as a native space model now uses those
stated restraints rather than inferring a direction from the legacy name.

Saved ambiguous supports remain refused in genuine 3D. Historical release
fixtures under `web/legacy-projects` remain historical evidence, not current
bundled model sources, and are not rewritten. The existing #2276 results-change
record documents main's silent fixed-restraint fallback; this round creates no
new advisory. Space projects with rollers receive the `bundled-support-metadata`
recheck notice. Review restraints and rerun analysis, combinations and design.

## Verification

The reproducer commit uses skipped Vitest regressions whose titles start with
`known wrong result: #2277`, enabled with `RUN_KNOWN_WRONG=2277`. Before production
edits, the targeted catalog run on `ceb2e1b59` produced 30 failures and 272 passing
controls. The unchanged deep-audit's RC-beam cases both failed on that parent
with the ambiguous-support refusal.

Coverage includes all JSON fixtures through three-argument, four-argument and
store adapters, registry loading, model-code examples and validation templates.
Metadata is compared with its source. The RC fixture reaches input building,
synchronous and asynchronous solves, and sequential and parallel combinations,
with linear and uplift-triggered nonlinear behavior in Basic 3D and PRO. Its
simple-support reactions and end moments are checked from the model's loads.
The plane portal and its embedded model are compared. Missing stored supports,
independent mask objects, and both sides of the ambiguous-support refusal are
covered. The original deep-audit and existing support regressions are retained.

These loader names are a web concern: native Rust receives explicit boolean
restraints. No separate native named-support loader exists. Node's parallel
combination call uses the existing sequential fallback when a browser worker
cannot start; browser worker execution is not claimed.
