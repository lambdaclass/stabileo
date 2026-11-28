# Saved reinforcement in builds with reinforcement sheets disabled

A disabled build keeps adopted reinforcement in the saved project and displays a notice whenever the adoption table has entries. For deflection, the calculation report and IFC export, it uses the same designed member reinforcement and detailing records as production on main. An enabled build continues to read the sheet rows and their reinforcement.

## Two-span beam hand check

The [saved project](../../web/src/lib/store/__tests__/fixtures/adopted-frame.json) contains two 6 m beam spans on three fixed-base columns. Both spans carry 30 kN/m dead load and 10 kN/m live load. The project explicitly saves 25 mm cover. The first span has a 0.30 × 0.60 m rectangular section and no member reinforcement record. Both profiles give the same gross-section service displacement relative to the chord, 1.487202417418934 mm. The following hand check starts from that solved displacement and the first span's service moment of 151.81173994738938 kN·m.

**Sheets disabled.** The project limit is L/250. With no designed member bars the production check uses the gross section and a long-term multiplier of 2. The total is 3 × 1.487202417418934 = **4.462 mm** to three decimals. The report has zero sheet reinforcement entries and the IFC contains zero reinforcing bars for this project. If the member has its own designed bars, its cracked-section calculation still applies.

**Sheets enabled.** The saved first-span midspan layout has three 16 mm bottom bars, two 10 mm top bars and a 10 mm stirrup. Using the [tabulated areas](../../web/src/lib/engine/codes/argentina/cirsoc201-rebar.ts) gives tension steel area 0.0006033 m² and compression steel area 0.0001570 m². The bar centroid depths are 0.557 m and 0.040 m. With modular ratio n = 200000/27000, solve the transformed-section balance by bisection between the two steel depths:

    b x²/2 + (n − 1) As′ (x − d′) = n As (d − x)

The neutral axis is 0.112883157 m below the compression face. Summing the concrete compression inertia about that axis and the two transformed steel terms gives Icr = 0.00103062881939 m⁴. Ig = 0.0054 m⁴ and Mcr = 0.62 √30 × 1000 × Ig / 0.30 = 61.1258374 kN·m. Table 24.2.3.5 gives Ie = Icr / [1 − (2 Mcr / (3 Ma))² (1 − Icr / Ig)] = 0.00109443637523 m⁴. With ρ′ = As′/(bd), the long-term multiplier is 2/(1 + 50ρ′) = 1.9102600743. The total is 1.487202417418934 × (Ig/Ie) × (1 + 1.9102600743) = **21.355 mm**. The report contains six sheet entries and the IFC contains 213 reinforcing bars. [CIRSOC 201-2025, chapter 24](../codes/CIRSOC/markdown/cirsoc-201-2025/capitulo-24-requisitos-de-comportamiento-en-servicio.md)

The same rule applies to a caller that prepares the beam-bar reader before checking several spans. In the published build the cracked-section check never consults that reader. Without member reinforcement it uses the established gross-section path, and with member reinforcement it computes the same cracked properties as the released member check. The opted-in result identifies whether its reinforcement came from a sheet or the member. The existing saved-reinforcement review entry covers this case.

### Beam minimum reinforcement in the standard designer

The standard CIRSOC beam check applies its usual minimum tension reinforcement. Only the enabled beam-sheet design can request its alternative minimum. Earlier integration code also accepted the sheet option on ordinary calls. In the regression fixture the standard required area was 3.2129999999999996 cm². Forwarding the sheet option to the same disabled-build check returned 0.0645846436339127 cm². The published check now returns the same complete result as a call with ordinary options. The published release on main already ignored this option.

The sheet designer still obtains its required compression area for a doubly reinforced beam. The public checking and verification paths expose the standard result fields.

### Ordinary bar development and tension laps

An integration build accepted a sheet confinement field in the ordinary CIRSOC tension-development calculation. Forwarding a sheet layout could shorten the ordinary development and the tension laps derived from it. Review bar lengths and lap references if an integration using those helpers forwarded sheet options to the standard designer. Main's table calculation already ignored that field.

The general equation is available through the enabled reinforcement-sheet designer, whose beam, column and slab calls supply their layouts explicitly. Its calculation note now reports the transverse reinforcement index used. The recorded bar lengths and minimums for an ordinary input or an explicitly requested sheet calculation are unchanged.
