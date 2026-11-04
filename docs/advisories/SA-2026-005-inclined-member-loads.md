# SA-2026-005: 2D inclined members missed the along-member part of their loads; member couples dropped in the 3D solve

| | |
|---|---|
| Severity | High |
| Status | Published 2026-10-21 (fixed in 0.3.0; live on stabileo.com since 2026-10-21) |
| Issue | [#343](https://github.com/lambdaclass/stabileo/issues/343) |
| Fix | PR [#437](https://github.com/lambdaclass/stabileo/pull/437) (rebase of #274; merged via #507, 2026-10-21) |
| Affected versions | axial part: deployments from 2026-09-25 (commit `6c196dd0`, "loads in global axes") through 0.2.0 and `main` until the fix; member couples on the 3D path: not yet bisected, up to 0.2.0 |
| Re-check registry | to add with the fix |

## Affected features

2D models (Basic and PRO): distributed loads, point loads and self-weight on inclined members
given in global axes or at an angle; 2D models solved through the 3D path with a couple applied on
a member.

## What was wrong

- The 2D load builder moved the along-member component of a load to the end nodes. Reactions and
  displacements were right, but the member saw no span load, so its **axial force N was constant**
  at the mean of its true end values. A gable rafter under 10 kN/m vertical read −41.67 kN at both
  ends where the closed form runs from −56.67 kN at the base to −26.67 kN at the apex (**26 % low
  at the base**); a 3-4-5 member under 10 kN/m read 0 / 0 instead of −15 / +15 kN. The diagram,
  inspector, report, Excel export and design all used that N.
- A couple applied on a member was dropped when a 2D model was solved by the 3D solver: a beam
  loaded only by a member couple gave **all reactions 0** (correct: 1.875).

## How to tell if your model is affected

A 2D model with inclined members (rafters, stairs, inclined braces, arches drawn as segments)
carrying distributed, point or self-weight loads with a component along the member; or a 2D model
with a couple on a member solved in 3D mode. Members designed for compression (columns, rafters)
are the most exposed.

## Fixed in

`main` (#437 (rebase of #274), merged through the batch-4 integration PR #507 and deployed to stabileo.com on
2026-10-21); released in 0.3.0. The workaround below is for checking results
obtained before that date; it must not be applied to new runs.

## Workaround

Until the fix: check N at both ends of inclined members by hand (N varies linearly along a member
under uniform load); model member couples as nodal couples at a node inserted in the member.

## What to do with results you already have

Re-check the axial force and the design of inclined members in 2D projects solved since
2026-09-25.

## Credits and references

Found while reviewing #271's member breakdown ("despiece"), which drew the true loads as unbalanced
free bodies; reproduced on `main` 40112bb1.
