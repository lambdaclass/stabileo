# Code profiles

A code profile describes one national code, edition and annex as data: the numbers, tables and
formula coefficients the app uses, each with the clause it comes from. Stabileo reads loads
(the load generator) and reinforced-concrete design (the reinforcement sheets) from profiles,
so adapting the app to a new country starts with filling one in. You do not need to program.

Profiles live in `web/src/lib/code-profiles/profiles/`, one JSON file per code:

| Profile | Role | Extends |
|---|---|---|
| `loads/cirsoc-101-2025.json` | loads | |
| `loads/en-1990-1991.json` | loads | |
| `loads/en-1990-1991-uk.json` | loads | `en-1990-1991` |
| `loads/asce7-22.json` | loads | |
| `loads/ts498-1997.json` | loads | |
| `rc/en-1992-1-1.json` | rc | |
| `rc/bs-en-1992-1-1.json` | rc | `en-1992-1-1` |

The schema is `web/src/lib/code-profiles/types.ts`. The loader (`load.ts`) applies `extends`,
validates (`validate.ts`) and converts imperial units to SI.

## What a profile holds

- **meta**: id, title, edition, revision, country, maturity, maintainers and the sources it cites.
  Each source's `id` is the regulation id the app prints in citations (`EN 1990`, `cirsoc-101`).
- **Values** `{ "v": 1.5, "unit": "-", "cite": { "clause": "2.4.2.4(1)" }, "status": "checked" }`.
  `cite.source` names one of the meta's sources; without it, the first one.
- **Tables** with axes, and **keyed tables** with named rows (the ψ factors), so that an annex
  replaces single rows.
- **Formulas** by id from a closed catalog (`formulas.ts`), with named coefficients:
  `{ "f": "punching.vmax", "k": { "c": 0.4 }, "cite": { "clause": "6.4.5(3)" } }`. A form enters
  the catalog when two codes share it. A procedure that differs in its steps, not its numbers,
  is code a maintainer writes and registers by id (a hook).
- **Occupancy tables**: one row per use, with uniform load `q`, concentrated load `Q`, and the
  flags the reduction rules read. Units go once per table (`psf` and `lbf` are accepted).

### `extends`

A profile can extend another and state only what its annex or edition changes. Objects merge
key by key, a list or a number replaces the parent's, and `null` removes a section. The meta is
never inherited, except that the sources add up. The UK annex to EN 1992-1-1 is four values:
see `rc/bs-en-1992-1-1.json`. Most codes derive from the ACI codes, the Eurocodes, or a British
or German code, so start from the closest parent.

## Status of each value

| Status | Meaning |
|---|---|
| `transcribed` (or no status) | One person read it from the code. |
| `checked` | A second person re-read it from the text, independently. |
| `toConfirm` | Not yet compared with the text. The app may use it, flagged. |

A profile with `"maturity": "validated"` cannot hold any `toConfirm` value. Maturity goes from
`draft` to `provisional` with a valid schema and a second transcription, and to `validated` when
published worked examples reproduce.

## What to find in any code

**Identity**: edition, amendments, national annexes, whether it is mandatory, language, which
code it derives from, safety format (limit states or allowable stresses), published worked examples.

**Loads**

1. Combinations: an enumerated list or ψ factors; exceptions; service, seismic and accidental combinations.
2. Imposed loads: uniform and concentrated by occupancy, reduction by area or floors, partitions, roofs.
3. Wind: return period, basic speed (gust or mean) and map, profile with height, topography, air density, factors, pressure coefficients, minimum load.
4. Snow: map or formula, altitude, exposure, importance, roof shapes, drifts.
5. Seismic: parameters, soil classes, spectrum, importance, systems and their reduction factors, period, methods, mass, vertical component, torsion, drift.

**Reinforced concrete**

1. Materials: specimen (cylinder or cube), concrete grades, steel grades, bar diameters.
2. Stress block; strength reduction factors φ or partial factors γ.
3. Minimum and maximum steel ratios.
4. Shear, torsion and punching.
5. Anchorage, laps, hooks and bend diameters.
6. Cover by exposure, bar spacing, cracking, deflections.
7. Columns and slenderness.
8. Walls.
9. Seismic detailing by ductility class.

For a first survey, the identity alone tells which profile a country would extend and how much is left.

## Review workflow

1. Fill in [`TEMPLATE.md`](TEMPLATE.md) for the code, or copy the closest profile and edit it.
2. Open a pull request with the profile (a maintainer converts the template if you prefer).
   Include values and clause numbers only: the repository is public, so never paste the code's
   text, tables as images, or the PDF.
3. Three reviews: the author; another engineer who works with that code, ideally from the
   country, who checks every cite against the text and marks what they re-read as `checked`;
   a maintainer, who checks the schema, the formula forms and the tests.
4. CI validates the profile: units, axes, ψ0 ≥ ψ1 ≥ ψ2, γ ≥ 1, a cite on every value, no
   `toConfirm` in a validated profile.
5. A new edition is a new profile that extends the old one. Each correction raises `revision`.
