# QA2 RC Workflow Feedback

- Date: 2026-04-16
- Reviewer: user
- Example: `RC QA Diagnostic (PRO)`
- Scope: PRO RC Design / RC Verification workflow coherence

## Overall Verdict

It needs a lot of work. Almost none of the design editing clearly affects the drawings, and most functionalities still feel disconnected.

## Blocking Issues

- Design editing does not reliably update drawings.
- Beam section editor and section drawing feel disconnected.
- Column editor changes do not clearly update drawings or verification.
- Longitudinal group, continuity, and anchorage edits do not clearly affect the engineering story.

## Serious Issues

- RC Design and RC Verification still do not feel like they are speaking to each other strongly enough.
- Verification should be gated by design state: the user should not meaningfully verify before at least one section is designed.
- `Accept Auto-Design` should support a global action at the top of the Design workflow for all elements.
- The RC QA example is still too limited/confusing for systematic QA.
- Constructibility feedback is not intuitive enough to verify confidently.

## Detailed Findings

### 1. Example Visibility and Loading

- Example loads.
- Concern: it is weird that most columns show torsion as the governing check.

### 2. RC Workflow Structure

- Having RC Design and RC Verification together inside Design is better.
- Problem: there is still a separate `Verification` tab under `Analysis`, which is confusing.
- Requested direction: keep verification only inside the Design workflow for now.

### 3. Baseline Design Population

- Major sections and drawings/schematics only appear after clicking `Accept Auto-Design` individually on each element.
- It still does not feel like accepting auto-design changes the end product in a trustworthy way.

Requested changes:

- Add a general `Accept Auto-Design for all elements` button near the beginning of the Design tab.
- RC Verification subtab should be locked/disabled until at least one element is designed.
- Suggested UX copy:
  - `You will be able to verify as soon as you design at least one section.`
- RC Verification should clearly show:
  - design principles
  - code/rulebook checks
  - Eurocode / CIRSOC-style verification content

### 4. Beam Cross-Section Completeness

- Top bars are not visible.
- Bottom bars are visible.
- Stirrups are visible, but it is not clear whether their thickness truly affects the look.
- Drawing feels stale.

### 5. Beam Section Edit Reaction

- Selected bar is clearly highlighted.
- Section drawing does not update at all.
- Values/results update.
- Constructibility feedback updates are not intuitive.
- Modified-rebar tracking updates, but not intuitively.

### 6. Beam Multi-Row Realism

- Drawing shows distinct rows, but effectively only one top row and one bottom row.
- This does not feel realistic or PRO-grade.
- Fit/spacing diagnostics do not react accordingly.

### 7. Beam Constructibility Diagnostics

- No clear constructibility warnings appear when overcrowding a row.
- Issue type is not understandable.

### 8. Beam Longitudinal Group Editing

- Elevation still feels generic.
- Verification does not reflect group changes.

### 9. Beam Continuity and Anchorage

- These edits do not clearly affect the engineering story.

### 10. Beam Overall Coherence

- Workflow still feels fragmented or contradictory.
- Section editor and section drawing are completely disconnected.
- Stirrups do not appear in the longitudinal/elevation drawing.
- Many details still feel incomplete or disconnected.

### 11. Column Default Proposal Quality

- Default proposal looks symmetric.
- Problem: additional rebars are not visible anywhere; only corner bars are seen for every element.

### 12. Column Structured Editing

- Drawing does not update.
- Verification does not update.
- Constructibility meaning is not intuitive from the QA point of view.
- Workflow feels sloppy.

### 13. Column Constructibility

- Intentionally overcrowding a face does not show diagnostics.
- Drawing does not show congestion.

### 14. Column Verification Coherence

- It still feels like the app secretly reduces everything to steel area only.
- Editor/drawing/verification do not reflect the same cage.

### 15. Modified-Rebar Tracking

Positive:

- Easy to find.
- Understandable.
- Helps navigate/review modified elements.

Requested improvements:

- Replace or extend the filter row with:
  - `Selected / All / Fail / Warn / Pass / Modified`
- `Selected` should be on by default.
- `Selected` behavior:
  - full list still appears
  - only the currently opened row/element is highlighted in the model
- Other filter buttons should highlight every element in that list in the model:
  - `All` highlights all
  - `Fail` highlights fail elements
  - `Warn` highlights warn elements
  - `Pass` highlights pass elements
  - `Modified` highlights modified elements
- Highlighting should use the same color status logic already shown in the Design tab.

### 16. QA Example Usefulness

- Still too limited/confusing for systematic QA.
- Needs continuous beams and columns to test interconnectivity better.
- Needs clearer diversity of governing checks by element type.

Requested coverage:

- Beams:
  - one governed by flexure
  - one governed by torsion
  - one with strong shear/stirrup demand
  - one with interior maximum moment behavior
- Columns:
  - one axial-dominant
  - one axial + moment
  - one with biaxial moment
  - one axial + torsion if needed

Concern:

- It is weird that all columns seem governed by torsion.
- Columns should usually show at least some axial demand if they are truly behaving as columns.

## Requested Product Direction

- Design editing and verification must feel like one coherent system.
- The user should not be able to meaningfully verify without going through the design workflow.
- Design must visibly affect:
  - cross-section drawings
  - longitudinal/elevation drawings
  - verification output
  - constructibility output

## Recommended Next Checkpoint

1. Fix beam and column drawing synchronization first.
2. Make verification clearly gated by design state.
3. Add `Accept Auto-Design for all elements`.
4. Remove or hide the duplicate top-level Verification entry from the Analysis area for PRO RC workflow.
5. Rebuild the RC QA example so it is truly diagnostic by governing-check diversity and member interaction.
6. Improve modified-rebar filter/highlight behavior.

## Approval State Summary

- Example visibility/loading: mixed pass
- Workflow structure: partial pass
- Beam drawing coherence: fail
- Beam edit reaction: fail
- Beam constructibility clarity: fail
- Beam longitudinal/anchorage coherence: fail
- Column drawing/editor coherence: fail
- Column constructibility clarity: fail
- Column verification coherence: fail
- Modified-rebar tracking discoverability: pass with requested improvements
- QA example usefulness: fail
