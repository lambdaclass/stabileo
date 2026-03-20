# Shell Family Selection Policy

This note defines the `shell-family selection logic` Dedaliano should use once multiple shell families are available in the same product surface.

The goal is:

- good automatic defaults for non-expert users
- explicit, explainable family choice
- advanced override when needed
- fewer silent bad element choices

This is now necessary because Dedaliano has a real shell stack:

- `DKT / DKMT`
- `MITC4`
- `MITC9`
- `SHB8-ANS`

## Selection Principle

Choose the `simplest family that is reliable for the geometry and workflow`.

The selector should evaluate:

1. geometry
2. mesh topology
3. curvature / non-planarity
4. thickness regime
5. element quality / distortion
6. analysis type
7. user intent (`fast default`, `higher accuracy`, `robust curved-shell`)

## First-Version Rules

### Rule 1: Triangle mesh

If the region is triangle-dominant:

- use `DKT / DKMT`

Reason:
- this is the native triangle shell/plate path

### Rule 2: Flat or mildly curved quadrilateral shell

If the geometry is mostly flat or only mildly curved and the mesh is 4-node quads:

- default to `MITC4`

Reason:
- efficient
- strong practical default
- good for slabs, walls, roofs, and many standard shell workflows

### Rule 3: Higher-accuracy quadrilateral shell

If the problem is still in the flat / mildly curved shell regime but accuracy per element matters more:

- prefer `MITC9`

Reason:
- better accuracy per element on standard shell benchmarks

### Rule 4: Strongly curved or non-planar shell

If geometry is strongly curved, significantly non-planar, or close to the known flat-faceted frontier:

- prefer `SHB8-ANS`

Reason:
- this is the current family that performs materially better on hemisphere / twisted-beam class problems

### Rule 5: Poor distortion / difficult shell quality

If shell quality metrics are poor enough that flat-faceted shell families are likely to struggle:

- recommend `SHB8-ANS`
- and also emit diagnostics that the mesh itself should still be improved

Reason:
- family choice should not silently hide a bad mesh

## Inputs The Selector Should Eventually Use

- `mesh_type`
  - triangle
  - 4-node quad
  - 9-node quad
  - solid-shell-compatible block

- `curvature_indicator`
  - flat
  - mildly curved
  - strongly curved

- `non_planarity`
  - approximately planar
  - warped / twisted / non-planar

- `distortion_metrics`
  - aspect ratio
  - skew
  - taper
  - warping
  - Jacobian quality

- `analysis_type`
  - linear static
  - modal
  - buckling
  - nonlinear
  - contact-sensitive

- `intent`
  - fast default
  - higher accuracy
  - robust curved-shell

## Product Behavior

The product should:

1. auto-pick a family by default
2. show the recommendation and why it was chosen
3. allow advanced manual override
4. warn when the override appears outside the recommended regime

This is better than either extreme:

- forcing every user to choose raw element families manually
- hiding all family selection completely

## Example Recommendations

| Situation | Recommended family | Why |
|---|---|---|
| Flat slab / wall / roof shell | `MITC4` | Fast default and good practical accuracy |
| Same shell, user wants higher-order accuracy | `MITC9` | Better accuracy per element on standard shell problems |
| Strongly curved or twisted shell | `SHB8-ANS` | Better on the curved/non-planar frontier |
| Triangle-dominant mesh | `DKT / DKMT` | Native triangle path |
| Distorted shell mesh with bad quality | `SHB8-ANS` + diagnostics | Better robustness, but still warn that mesh quality is poor |

## Important Future Extensions

Once Dedaliano adds more shell-adjacent workflow breadth, extend the selector to:

- `layered / laminated shell workflows`
- `axisymmetric workflows`
- `nonlinear / corotational shell depth`

These are more important than blindly adding more named shell families.

## Non-Goals

This selector should not:

- promise perfect element choice in all cases
- hide important diagnostics
- silently override explicit advanced user choices

Its purpose is:

- good automatic defaults
- explainable recommendations
- safer product behavior
