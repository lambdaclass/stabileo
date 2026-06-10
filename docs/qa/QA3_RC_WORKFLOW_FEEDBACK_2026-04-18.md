QA3 Results

Date: 2026-04-18
Branch: pr/3-calc-report-and-pro-polish
App: PRO mode
Primary example: RC QA Diagnostic (PRO)
Secondary reference: 7-Story RC

Overall QA3 verdict:
Core trust is still missing, since drawing editing is very important.

Blocking issues:
- Drawings should always reflect the changes made to an element's design.

Serious issues:
- Design and Verification should be joined more tightly so verification appears at the end of the opened element row in the Design tab.

Minor issues:
- In PRO mode -> Analysis dropdown -> the old "Verification" button is still there. Only Design should be there.

Most important next step:
- Fix drawing editing.
- Reuse what already works from RC Verification manual overrides and merge that behavior into RC Design without duplicating systems.
- Make manual override a design functionality.
- Keep verification as the surface that shows code-based checks for the chosen manual (CIRSOC, Eurocode, etc.).
- Join the drawings together so the same drawing surface is used consistently.

Step 1: Example loading and first impression
- Loads without errors.
- Feels smaller and easier to inspect than 7-Story RC.

Step 2: RC workflow structure
- RC Design and RC Verification feel like one workflow now, though it still needs work.
- Editing mostly belongs in RC Design now.
- There is still a manual override button in RC Verification that works well.
- In RC Design, manual editing mostly does not work because edits do not actually update the drawings.
- Requested direction:
  - Verification should not be a separate right-side tab in the long term.
  - Each expanded row in Design should have its own Verification section at the end.
  - If something does not verify, the user should be able to edit it right there.

Step 3: Batch auto-design workflow
- The button is easy to find.
- It clearly designs the whole set.
- Rows visibly show designed reinforcement and drawings.
- The default result feels clean enough to continue working from.
- Problems / requested changes:
  - The modified reinforcement row currently shows every element that was designed.
  - That row should not exist in its current meaning.
  - If the user wants that view, it should come from the "Modified" filter/sub-tab.
  - Those are not really modified elements; they are designed elements.
  - "Modified" should list only user-modified elements.
  - Fail / Warn / Pass are not intuitive before design acceptance.
  - Utilization should be tied to designed elements, not shown as if it were already meaningful before accepting auto-design.
  - Fail / Warn / Pass should relate to designed elements only.

Step 4: Beam section drawing sync
- Top bars are visible, but never by default because auto-design does not propose them.
- Bottom bars are visible, though not intuitive to edit.
- Stirrups are visible, but do not change when edited.
- Edits still update numbers without updating the drawing.

Step 5: Beam anchorage edit reaction
- Anchorage behavior still feels disconnected.

Step 6: Beam longitudinal / elevation coherence
- Elevation still feels generic and disconnected.
- It does not update when more bars are added.

Step 7: Beam overall coherence
- Beam workflow still feels fragmented or contradictory.
- Main reason: things that should update the drawing do not do so.
- The Manual Override inside RC Verification actually works and modifies drawings.
- Requested direction:
  - Grab what works from Manual Override.
  - Combine it with RC Design editing.
  - Do not duplicate it.
  - Move the working editing path into RC Design.

Step 8: Column default proposal
- Looks symmetric.

Step 9: Column drawing sync and visibility
- Section still looks like corners only.
- Edits are still not reflected in the drawing at all.

Step 10: Constructibility clarity
- Intentionally overcrowding a row or face is impossible to judge because the drawing does not update.

Step 11: Modified-rebar filter usefulness
- Requested filter model:
  - Selected:
    - Highlights in the model whatever row is expanded.
  - All:
    - Shows all elements.
  - Un-designed:
    - New filter.
    - Shows elements that have not been auto-designed, modified, or manually designed.
    - Before auto-design: should list all.
    - After auto-design: should list none, except elements the user clears.
  - Fail / Warn / Pass:
    - Should be empty until auto-design is accepted.
    - After that, only then should they list the corresponding designed elements.
  - Modified:
    - User-modified elements only.

Step 12: RC Verification continuity
- Verification opens as a continuation, not a reset.
- View is already populated.
- Still hard to trust that verification is using the designed state because drawings do not update and look too similar.

Step 13: QA example usefulness
- Better than before.
- Still lacks a beam that has My and Mz at the same time.
- Requested change:
  - Add horizontal loads to elements 19 and 20 so they show combined My + Mz behavior.

Step 14: Overall workflow verdict
- Core trust is still missing because drawing editing is very important.
