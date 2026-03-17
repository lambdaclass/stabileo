# ADR 0001: Z-up 3D Coordinate System

## Status
Accepted

## Decision

The canonical 3D geometry contract for Dedaliano/Stabileo is:

- `x` = horizontal width
- `y` = horizontal plan depth
- `z` = elevation
- gravity direction = `(0, 0, -1)`
- default horizontal working plane = `XY`
- top view looks down global `+Z`

## Why

The product previously mixed `Y-up` and `Z-up` assumptions across the frontend viewport, AI model-context extraction, and backend generators. That produced rotated 3D geometry and broken edit actions.

The system now treats mixed conventions as correctness bugs.

## Enforcement

The contract is enforced in:

- frontend shared helper: `web/src/lib/geometry/coordinate-system.ts`
- backend capability contract: `backend/src/capabilities/coordinate_system.rs`
- backend generator tests asserting `Z-up` snapshots
- frontend seam tests for model-context extraction and viewport plane helpers
- grep-style guard on the seam files to reject suspicious `Y-up` assumptions

## Migration rule

- New 3D builder/editor code must use the shared coordinate-system helpers.
- New backend 3D generator or edit-action code must assert or preserve `z` as elevation.
- Raw `node.y` must not be used as “floor height” or “elevation” in the 3D builder/editor path.

## Notes

This ADR governs the 3D product/runtime contract for AI building, viewport interpretation, and generated model snapshots. It does not by itself rewrite every historical solver/internal test convention in unrelated subsystems.
