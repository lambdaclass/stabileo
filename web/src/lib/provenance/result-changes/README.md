# Result changes, one file each

Every change that makes the same saved model give different numbers is registered here, so a
project solved before it is told on opening ([docs/verification/PROVENANCE.md](../../../../../docs/verification/PROVENANCE.md)).

- `numbered.json`: the results versions numbered by hand, frozen. Never add to it, renumber it or remove from it.
- `<id>.json`: one change each, **without a version**.

## Adding a results change

1. Add `web/src/lib/provenance/result-changes/<id>.json`, the file named after its `id`:

   ```json
   {
     "id": "connector-mechanism-2d-refused",
     "date": "2026-11-05",
     "prs": [1415],
     "area": "analysis",
     "when": { "allOf": [["plane2D"], ["connectors"]] },
     "quantities": ["solve.ok"],
     "title": { "en": "…", "es": "…", "pt": "…", "de": "…", "fr": "…", "tr": "…", "hu": "…" },
     "explanation": { "en": "…", "es": "…", "pt": "…", "de": "…", "fr": "…", "tr": "…", "hu": "…" },
     "changelog": { "file": "docs/results-changes/….md", "heading": "…" }
   }
   ```

   Every field is as in PROVENANCE.md, except `resultsVersion`, which you leave out.
2. Add the `changelog.d/` fragment under `### BREAKING (results)` and the write-up the entry links to.
3. Regenerate the results snapshots if they moved (`make snapshots-update`).

There's nothing else to do. Don't set a version, bump `currentResultsVersion`, add a `RELEASED`
pin, restamp `rc-footing-cad-poc.ded.json` or move its sha256 pins. A test that needs the current
version reads `RESULT_CHANGES.currentResultsVersion`, and one that needs a change's version looks
the change up by id.

## How the version is given

Each merge to main that adds entry files takes the next results version, in main's merge order:
the first takes the version above the highest in `numbered.json`, the next one more, and so on. Entries merged together share
one. `web/scripts/result-changes/registry.mjs` reads that order from the first-parent history
of the commit being built. The same commit always gives the same registry. A build without the
history fails rather than guess: CI checks out the whole history, and a copy without `.git`
(Docker) reads `web/.result-change-order.json` from `make result-changes.order`.

Two pull requests that each add a file never conflict, and the merge queue can land them in one
run. Before a pull request merges, its entries show the version after main's: it is a preview.
On a branch that merged main, main's entries merged by that merge share one preview version. The
numbers are exact on main and in CI, which builds the pull request merged onto main.

Once an entry is on main, the results snapshot gate (`make check.results-snapshot-gate`) fails a
pull request that removes, renames or changes it. Only its wording can change: `title`,
`explanation` and `changelog`. To withdraw a change, add a new entry.

## Snapshot applicability

For every moved snapshot field, the snapshot gate opens the corpus fixture through the same
example/project loader and workspace used by the snapshot test. A new entry with `when` must
match that model and the analysis that produced the field; running another analysis does not
cover it. Its `quantities` must declare the moved collection or field (`*` for all fields in the
entry's area). `solve.ok` must be explicit for a change in solve success or refusal. Design
fields require a design entry. Missing model context or undeclared fields fail closed. Multiple
applicable entries can cover different fields. An examples-scoped entry covers only its listed
examples and still requires the two-engine equivalence proof, even alongside engine entries.

## Exact frozen outputs

`web/results-frozen/` complements the rounded web snapshots. Its small WASM
corpus replays the six audited SSI inputs, three bisected arc-length inputs,
a 3D SSI control and the two public slab support selections. The results CI
project executes `frozen-engine.test.ts`; an output change fails that test until
its baseline is deliberately updated. To update only this corpus, run through
`make shell`:

```sh
cd web
RESULTS_FROZEN_UPDATE=1 npx vitest run --project results src/lib/results-snapshot/__tests__/frozen-engine.test.ts
```

Then `make check.results-snapshot-gate BASE=<base>` compares committed frozen
outputs exactly and requires an applicable new entry and a results fragment.
`freezeValues` records full-precision numeric leaves, path steps and collection
lengths, including empty lists. Only timing fields and build provenance are
excluded. `compareFrozen` is shared by the execution test and registration
gate. A snapshot format bump cannot exempt new frozen output fields.

The older corpus lacks SSI, arc-length and generated gallery solves. It also
rounds numbers, compares within a tolerance and preserves old spellings within
that tolerance when regenerating. That is why it missed the audited classes;
the exact corpus does not use those exceptions. It is intentionally small and
does not claim to freeze every supported analysis or parameter combination.

A generated gallery can use an explicit context feature, such as
`gallery:slab-on-columns:walls`, in `when`. Only its gallery capture supplies
that feature: it is never inferred by `modelFeatures` for saved projects. It
cannot excuse saved-model engine changes or a different gallery selection.
The bundled-example scope and its two-engine equivalence proof remain as
specified above. Retrospective entries identify the original PR in `prs`; their
new results version is the registration merge's version, not a rewritten
historical stamp.
