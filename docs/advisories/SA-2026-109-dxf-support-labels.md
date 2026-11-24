# SA-2026-109: DXF import could silently assign a pinned support

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-22 |
| Issue | [#2278](https://github.com/lambdaclass/stabileo/issues/2278) |
| Fix | PR [#2494](https://github.com/lambdaclass/stabileo/pull/2494), merged as `a1d0032fd` |
| Fixed release | the next release after 0.6.4 |
| Affected versions | Reproduced on pre-fix main at `918a76194`. Affected releases are unconfirmed |
| Re-check registry | — |

## Affected features

Planar DXF import of text labels or block names on the `APOYOS` support
layer.

## What was wrong

The importer treated an unrecognised support label as a pin and gave
no warning. A solve could then use a support the engineer had never
specified.

In a WASM probe on main before the fix, a single member had
`EMPOTRADO` at the left node, `ELASTIC_VERTICAL` at the right node
and `Fx = 10 kN` at the right node. Import gave no warnings and
assigned a fixed left support and a pinned right support. The solve
returned `rx = 0 kN` at the left and `rx = -10 kN` at the right.
With an explicit `RX` roller label at the right node, the reactions
were `rx = -10 kN` at the left and `rx = 0 kN` at the right.
[Results-change record](../results-changes/2026-11-dxf-support-labels.md).

## How to tell if your model is affected

Compare the supports in the imported model with the intended supports
in the original drawing. Inspect text and block names on `APOYOS`,
especially at nodes that imported as pinned. Saved models retain the
assigned support type without the original DXF label or layer.

## Fixed in

The next release after 0.6.4. PR
[#2494](https://github.com/lambdaclass/stabileo/pull/2494) blocks the
import when a support label or block name is unknown or ambiguous,
or when labels specify different support types at a node. The
translated diagnostic identifies the label or labels and their layer.

## Workaround

Use recognised labels that match the intended supports. If a support
cannot be represented by a recognised label, assign the intended
support explicitly in the model and verify its properties before
solving.

## What to do with results you already have

Check imported supports against the original drawing and correct any
mismatches. Rerun affected analyses and combinations, check the
reactions, repeat dependent design checks and regenerate affected
reports.

## Credits and references

See [issue #2278](https://github.com/lambdaclass/stabileo/issues/2278)
for the report and [PR #2494](https://github.com/lambdaclass/stabileo/pull/2494)
for the import checks and regression tests.
