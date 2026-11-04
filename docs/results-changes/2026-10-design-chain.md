# Results changes of the design chain (results version 4)

The design stages entered `main` in two steps: #460 and #461 on 2026-10-25, and #462–#475 together
with the design switch of #624 on 2026-10-26. Each section below is one entry of the registry of
result-affecting changes (`web/src/lib/provenance/result-changes.json`, results version 4). A
project last solved with an earlier results version is told, when it is opened, about the entries
that apply to its model, and its results stay marked out of date until it is solved again.

What a re-run does depends on the design switch (PRO settings):

- **Re-run the analysis** solves the model again with this build and stamps it with version 4.
  With design off this is all it does: no design, no code check and no sizing run, and nothing
  of the saved design is reported as current.
- **Re-run analysis and design** (design on) also checks the saved reinforcement again with the
  current rules. It does not re-design: bars the engineer chose are kept, and the question is
  whether they still pass.
- A saved design that has not been checked again stays **out of date**: its verdicts were read
  on the earlier analysis and rules.

Projects stamped with version 3 that were solved after #461 reached `main` already carry its
steel changes; they are shown those entries once more. That is the side the registry errs on:
one notice too many rather than a change not told.

## Dynamic analyses refuse member insertion offsets and shell offsets

**#460, analysis.** Modal, response-spectrum and time-history analyses, and the modal step of the
seismic and wind load plans, now refuse a model whose members carry insertion offsets or whose
shells carry offsets, and say why. Before, they were solved on the node lines, as if the offsets
were not there, while the static analysis did take them. Static analyses are unchanged.

What to re-check: a project with offsets that relied on modal or spectral results. Those results
did not include the eccentricities. Use static seismic forces, or remove the offsets, until the
dynamic chain takes them.

## CIRSOC 301: a limit state the engine cannot evaluate holds the member instead of failing it

**#461, design.** A steel member whose limit state the CIRSOC 301 engine refused (out of its
scope, missing data) used to read as failed, with an infinite ratio. It now reads «not
evaluated»: held, with its reason, with no utilisation, and never counted as passing. A member
that failed only for that reason is no longer reported as failed; it is not verified either.

## CIRSOC 301: undeclared fabrication and load height are read both ways

**#461, design.** A section that does not state whether it is rolled or welded used to be taken
as welded unless it came from a rolled catalogue. Both readings are now checked, and the member
is held where they disagree. A member that does not state where its transverse load acts is
checked with the load on the top flange, the lower bound; a failure there is checked again with
the load on the web: failing both, it fails; passing on the web, it is held.

## CIRSOC 301: H.1 on forces that act together, lengths per axis and per flange, weak-axis shear

**#461, design.** The H.1 interaction is rated on the forces that act together, each combination
at each station, instead of maxima taken from different combinations: some ratios fall. The
unbraced lengths are read per axis and per flange from the member's bracing; with none declared
they are the member's length, as before. Weak-axis shear (G.6) is now checked and can only lower
a verdict. A ratio between 0.95 and 1.00 reads as a warning, still a pass.

## Cold-formed sections are no longer checked with CIRSOC 301

**#461, design.** Cold-formed sections used to be checked by CIRSOC 301 as if they were
hot-rolled. CIRSOC 301 sends them to CIRSOC 303, which is not implemented yet, so these members
are now reported as not designed, with the reason. A pass obtained before for a cold-formed
member is not a valid verification.

## Aluminium, timber and composite members are no longer checked as steel

**#463, design.** A member of aluminium, timber or composite material used to be checked as
CIRSOC 301 steel. It is now checked by its own checker, and until that check has run it is not
shown as verified anywhere. EC3 lateral-torsional buckling (6.3.3) is read with the engine's
Annex B, and certificates of other codes read «partial» where the certified checker does not
cover the whole reading.

## Concrete beams: lateral role, minimum shear reinforcement and torsion

**#462, design.** A concrete beam that does not declare its role in the lateral system is designed
as part of it, with that system's anchorage requirements; declare it as not lateral to design it
for gravity alone. Beams deeper than 250 mm fail below the minimum shear reinforcement where
CIRSOC 201 §9.6.3.1 requires it, and the sizing stops offering stirrups under Av,min (§9.6.3.4).
Beam torsion is checked on CIRSOC models. A member whose analysis joins a slab to a column at a
single node reads held, never as modelled.

## Concrete beams with a slab on them are designed about their depth

**#475, design.** An upright beam with a slab cast on it used to be refused as biaxial, because
of the in-plane moment the slab's diaphragm action puts in it. It is now designed about its depth,
and the in-plane moment is the diaphragm's, as the detail says. A beam turned about its axis, or
one without a slab, keeps the biaxial check.

## Strip footings under walls are checked along the whole strip

**#475, design.** A strip footing under a wall used to be checked under each of the wall's feet
on its own; the analysis gives the feet more load under a column than between columns, so along
the strip the resultant fell far off centre and the edge pressure doubled. The wall, stiff in its
plane, spreads that load along the strip, as a wall footing is designed per metre: its feet are
now one length of wall over the whole strip, at their resultant across it, and the design says
so. A footing tied by strap beams is checked centred under its load plus what the straps pass it.
An edge-pressure factor of the soil changes nothing unless it is declared.
