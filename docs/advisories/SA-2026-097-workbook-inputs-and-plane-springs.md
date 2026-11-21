# SA-2026-097: Workbook import could drop model data and export could mislabel 2D rotational springs

| | |
|---|---|
| Severity | High |
| Status | Published 2026-11-21 |
| Issue | [#2370](https://github.com/lambdaclass/stabileo/issues/2370), [#2383](https://github.com/lambdaclass/stabileo/issues/2383) |
| Fix | PR [#2395](https://github.com/lambdaclass/stabileo/pull/2395), merged as `95354e5d5` |
| Fixed release | 0.6.3 |
| Affected versions | Confirmed in 0.6.2. Earliest affected release is unconfirmed |
| Re-check registry | None. Compare the original workbook with the saved model and reimport the corrected source |

## Affected features

Excel model import in Basic and PRO and the Supports sheet in exported
workbooks for 2D models with rotational springs. Analyses and reports
based on an incomplete imported model can carry the error forward.

## What was wrong

The importer could use just the first sheet when names differed only in
letter case or surrounding spaces. Within a sheet it could overwrite a
coordinate when two headers referred to the same field. It could also
discard incompatible load components or settings. In the reproducer, a
header-only Loads sheet hid a second sheet containing a nodal load and
the workbook imported without reporting the omitted load.

The export put the planar rotational spring value under the translational
`kz [kN/m]` heading. The workbook presented a rotational stiffness as a
translational stiffness, so someone reading the export could use the
value for the wrong degree of freedom and in the wrong units.

## How to tell if your model is affected

Compare the original workbook and imported model. Look for repeated
sheet names or column headers, missing headers, unsupported fields on
load rows, out-of-plane couples in 2D and support restraints that differ
from the original. In an old export from a 2D model, check any populated
`kz [kN/m]` spring entry against the rotational spring in the original model.

## Fixed in

0.6.3. PR [#2395](https://github.com/lambdaclass/stabileo/pull/2395) blocks
imports with ambiguous or unsupported model data before replacing the
current model. Planar rotational stiffness exports as `kr [kN·m/rad]`.
The importer still recognizes legacy planar spring files.

## Workaround

Use 0.6.3 to import and export. If upgrading is unavailable, compare the
imported coordinates, supports and loads with the source workbook before
using results. Take spring stiffness and its units from the source model
when checking an earlier export.

## What to do with results you already have

Correct the source workbook and reimport it. Verify geometry, restraints
and loads before rerunning analyses and dependent checks. Regenerate
affected workbooks and review calculations and reports that used the
earlier model or exported stiffness.

## Credits and references

See [PR #2395](https://github.com/lambdaclass/stabileo/pull/2395) for import
and spring round-trip reproducers and
[issue #2383](https://github.com/lambdaclass/stabileo/issues/2383) for the
spring labelling defect.
