# Concentrated live actions require an explicit check

Issue #2207. The change affects automatic CIRSOC 101-2025 load-plan availability, not solver arithmetic. Plans for occupancies with positive Table 4.1 concentrated loads or concentrated-load cross-references, and plans with roof settings or a roof-category occupancy now return `BLOCKED`. Their uniform-load, combination and mass diagnostics remain inspectable; they are incomplete diagnostics, not a design answer. Both the dialog and direct store application refuse to apply them. Existing manually specified load cases remain supported. Existing saved models are not automatically corrected.

## Normative basis

Source: the repository's [CIRSOC 101-2025 chapter 4](../codes/CIRSOC/markdown/cirsoc-101-2025/capitulo-4-sobrecargas-de-diseno.md), §4.4, printed page 69, PDF page 85. The following transcribes only the left, normative column; the adjacent commentary is not part of the quotation:

> Los pisos y otras superficies similares se deberán diseñar para soportar con seguridad las cargas uniformemente distribuidas prescriptas en el artículo 4.3 o la carga concentrada en kN especificada en la Tabla 4.1; de ambas la que produzca las mayores solicitaciones.
>
> A menos que se especifiquen otras condiciones, se deberá suponer que la carga concentrada indicada se distribuirá uniformemente sobre un área cuadrada de 0,75 m de lado (0,56 m2) que estará localizada de manera tal de producir los máximos efectos de carga en los elementos estructurales.

The same article requires a suspended concentrated action of at least 9 kN alongside permanent load at the specified exposed roof-truss and supporting-system nodes for storage, commercial warehousing and manufacturing buildings and commercial-garage mezzanines. For all other occupancies it states:

> Para todos los otros destinos, cualquier elemento estructural de una cubierta de edificio deberá ser capaz de soportar una carga concentrada de 1 kN ubicada en la posición más desfavorable.

The continuation on PDF page 86 states:

> Las cargas concentradas para estructuras de cubierta indicadas en los párrafos anteriores no actúan simultáneamente con las sobrecargas especificadas en el artículo 4.8.

Table 4.1 note (j) states:

> La carga concentrada mínima sobre los escalones de una escalera es 1,35 kN.

Note (r) specifies the stair-tread contact area and alternative:

> La carga mínima concentrada en los peldaños de las escaleras, en un área de 50 mm × 50 mm no se deberá aplicar de manera simultánea con la carga uniforme.

§4.10.1 requires the more unfavourable of the uniform passenger-garage load and its specified concentrated actions: 14 kN over 13000 mm² for cars carrying at most nine passengers, or 10 kN per wheel for mechanical parking without circulation areas. The catalogue now preserves these cross-references for both stair occupancies and passenger garages even though each has a numeric uniform value. They also refuse; no generic patch or vehicle assumption replaces their special rules.

Special table footnotes and articles can impose other contact areas, placements or simultaneity rules. This change does not substitute the generic patch for those rules: it refuses the unimplemented check. §4.7.1 concerns minimum uniformly distributed Table 4.1 loads; reducing uniform L never resolves the concentrated requirement.

## Independent witness and verification

The issue's minimal equivalent is a simply supported 2 m office beam with a 1 m tributary width. Table 4.1 in the same repository copy, the office row on PDF page 80, specifies Lo = 2.5 kN/m² and P = 9 kN. On unchanged origin/main the complete plan returns `READY`, no unsupported message and only uniform L = 2.5 kN/m. Its midspan moment is qL²/8 = 1.25 kN·m.

A centered patch of longitudinal length a = 0.75 m transfers its full P to this carrier. Its intensity is P/a = 12 kN/m over [0.625, 1.375] m. Each reaction is P/2 = 4.5 kN. Let positive sagging be M and downward applied load be positive. Independent section equilibrium gives:

- V(x) = P/2 − (P/a) clamp(x − (L−a)/2, 0, a).
- M(x) = Px/2 − P/(2a) ((x−(L−a)/2)₊² − (x−(L+a)/2)₊²).
- M(L/2) = PL/4 − Pa/8 = 3.65625 kN·m.
- Axis-centered loading has zero torsion and zero out-of-plane shear and bending.

By virtual work, midspan displacement is the integral of patch intensity against the simply supported beam's unit-load flexibility. On the left half that flexibility is s(3L²−4s²)/(48EI). Integrating symmetrically gives downward displacement P(8L³−4La²+a³)/(384EI). For a = L this also gives the independent uniform-load formula 5qL⁴/(384EI).

The tests solve this manually specified patch through 2D and 3D WASM linear and P-Delta entry points, check shear and bending at three stations of every member segment, check spatial torsion and the unloaded plane, and check midspan deflection. They repeat with 2, 4 and 10 segments and spatial plan rotation/reflection. The same entry points solve supported dwelling loads taken from the generator and retain their uniform-load hand solution. Concentrated office plans consistently refuse; no numerical claim is made for a generated governing placement. The automatic planner is TypeScript shared by both workspaces and has no native Rust automatic-generation entry point.

## Scope and compatibility

A mandatory load-code `generationBlockers` operation evaluates both floor and roof occupancies together before a plan can be `READY`; geometry, live-load reduction, combinations and shell routing cannot bypass it. CIRSOC checks the catalogue metadata, so positive concentrated rows and required concentrated-rule references automatically refuse even when a numeric uniform value is available. Every roof plan, including a roof-category occupancy without separate roof settings, also refuses the currently unimplemented concentrated roof checks. The store checks status and blocking diagnostics before any model or provenance mutation.

The reference results corpus uses already specified loads or the separate snow generator. Targeted results snapshots must remain unchanged; no tolerance, baseline or assertion is relaxed. Numerical engine results for the same explicit input are unchanged. Review previously generated affected models manually: rerunning a solver alone cannot supply an omitted action.

A full moving-patch and member-effect envelope implementation is deliberately deferred. It would need true member loading, physical tributary transfer, eccentric effects, special footnotes and independent governing placements for each response. Choosing midspan for every member or substituting endpoint resultants would not satisfy §4.4.
