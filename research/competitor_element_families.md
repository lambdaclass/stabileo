# Competitor Element Family Matrix

This note focuses on `shell / plate / solid-related` element families and behavior classes exposed by major structural competitors, with emphasis on:

- what the competitor explicitly documents
- what Dedaliano already matches
- what still looks important to add

This is not a full product comparison.
For the broader open-source solver comparison, see:
- [open_source_solver_comparison.md](/Users/unbalancedparen/projects/dedaliano/research/open_source_solver_comparison.md)

## Scope

The goal is not to copy every competitor label.
The goal is to understand:

1. what shell/plate/solid categories the strongest structural tools expose
2. which of those categories matter most in practice
3. what still separates Dedaliano from that envelope

## Matrix

| Product | Explicit families documented | Behavior types | Topology | Thin / thick | Layered / composite | Solid-shell / solid | Nonlinear shell support | Contact coupling | Dedaliano already matches | Dedaliano still lacks |
|---|---|---|---|---|---|---|---|---|---|---|
| `RFEM` | `Lynn-Dhillon`, `MITC3`, `MITC4`, wall, shell, solid | plate, wall, shell, solid | tri/quad/solid categories | yes | broader shell/solid material workflows | yes | yes, broadly in product scope | yes | plate/shell families, solid-shell path, broad shell workflow direction | explicit layered workflows, broader constitutive shell depth, some specialized shell families |
| `OpenSees` | `ShellMITC4`, `ASDShellQ4`, `ASDShellT3`, broader ecosystem references to `MITC9`, `DKGQ`, `DKGT`, nonlinear shell families | shell-focused structural mechanics | tri/quad shell families | yes | limited compared with commercial integrated workflow products | not the main emphasis, but broader structural element variety exists | yes | yes | MITC4, MITC9-class breadth, strong structural shell focus | more named triangular shell breadth, broader shell nonlinear workflow maturity |
| `ETABS / SAP2000` | `membrane`, `plate`, `shell`, `layered shell`, thin/thick behavior classes | membrane / plate / shell / layered shell | shell object classes, plus solid-type modeling in broader CSI ecosystem | yes | yes | yes in broader CSI ecosystem | yes in broader product behavior | yes in broader workflows | shell/plate/solid-shell direction, thin/thick practical behavior | layered shell workflow depth, clearer shell-family selection/productization |
| `Robot Structural Analysis` | plate, shell, plane stress, plane deformation, axisymmetric, volumetric | plate/shell/continuum behavior classes | shell / axisymmetric / volumetric classes | yes | less explicit publicly | volumetric yes | yes | yes in broader workflow sense | shell + solid-shell direction, broad behavior-class mindset | axisymmetric workflow, broader continuum workflow packaging |
| `STAAD.Pro` | less explicit publicly on family names; clearly supports plate/shell FE workflows | plate/shell structural workflows | shell/plate workflows | yes | not clearly documented in the same explicit way | yes in broader workflow sense | yes in practical product scope | yes in practical product scope | broad practical shell direction | explicit family transparency, layered/axisymmetric depth, stronger documented selection guidance |

## Dedaliano Current Shell / Plate / Solid Stack

Current implemented families:

- `DKT / DKMT`
- `MITC4`
- `MITC9`
- `SHB8-ANS` solid-shell

This means Dedaliano already has:

- triangle plate/shell coverage
- 4-node quad shell coverage
- higher-order quad shell coverage
- solid-shell coverage for curved / non-planar frontier cases

That is already a strong shell stack.

## What Still Looks Important

Ranked by importance, not by family count.

### 1. Layered / laminated shell workflows

Why it matters:

- commercial competitors expose layered shell behavior or equivalent workflows
- useful for reinforced concrete layering, composites, and more advanced shell constitutive behavior
- higher practical value than adding another interpolation family just to match a name

### 2. Axisymmetric workflow

Why it matters:

- explicitly present in Robot-style behavior-class products
- useful for tanks, silos, domes, pressure vessels, shells of revolution
- high engineering value without requiring a full broad continuum expansion

### 3. Nonlinear / corotational shell workflow depth

Why it matters:

- competitors are not just stronger because they have more shell names
- they are stronger because shells participate in more nonlinear and mixed workflows robustly
- this matters more than another low-priority shell family

### 4. Dedicated curved-shell formulation depth

Why it matters:

- still the clearest direction if the current `MITC4 / MITC9 / SHB8-ANS` stack proves insufficient on practical curved-shell workflows
- should be driven by frontier benchmarks, not by label chasing

### 5. Layered solid / shell material workflow depth

Why it matters:

- helps close the gap to richer commercial shell workflows
- useful for advanced RC and composite work

## Lower-Priority Family Additions

These are plausible, but not the highest-value next steps.

- `MITC3`
- `MITC6`
- `MITC8`
- `Kirchhoff-Love shell family`
- `general 3D solid brick continuum family`

Reason:

Dedaliano already has the main practical shell families needed for a serious structural solver.
The bigger remaining gaps are workflow depth, constitutive depth, and nonlinear shell maturity.

## Recommended Interpretation

If the goal is:

`support what the strongest competitors support in the most important ways`

then the best next shell-adjacent targets are:

1. `layered shell workflows`
2. `axisymmetric workflows`
3. `nonlinear / corotational shell workflow depth`
4. `curved-shell formulation depth if still justified`
5. only later, more interpolation-family breadth

## Sources

- RFEM element list:
  https://www.dlubal.com/en/downloads-and-information/documents/online-manuals/software-validation/004014
- RFEM FAQ / theoretical background references:
  https://www.dlubal.com/en/support-and-learning/support/faq/002960
- OpenSees ASDShellQ4:
  https://opensees.github.io/OpenSeesDocumentation/user/manual/model/elements/ASDShellQ4.html
- OpenSees ASDShellT3:
  https://opensees.github.io/OpenSeesDocumentation/user/manual/model/elements/ASDShellT3.html
- OpenSees shell-response families:
  https://opstool.readthedocs.io/en/v1.0.19/src/post/shell_resp.html
- ETABS slab / shell property types:
  https://docs.csiamerica.com/help-files/etabs/Menus/Define/Section_Properties/Slab_Section/Slab_Property_Data_Form.htm
- ETABS wall property types:
  https://docs.csiamerica.com/help-files/etabs/Menus/Define/Section_Properties/Wall_Section/Wall_Property_Data_Form.htm
- Robot structure types:
  https://help.autodesk.com/cloudhelp/2015/ENU/Robot/files/GUID-3ED2AEB1-A7DB-47A5-BE91-395E73B1AAE5.htm
- Robot shell geometric nonlinearity:
  https://help.autodesk.com/cloudhelp/2015/ITA/Robot/files/GUID-56F256FE-59A8-4744-8E6A-ACEF2EF0709B.htm
